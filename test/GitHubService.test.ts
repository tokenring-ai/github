import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import VaultService from "../../vault/VaultService.ts";
import GitHubOAuthCallbackResource from "../GitHubOAuthCallbackResource.ts";
import GitHubService, { GITHUB_OAUTH_CALLBACK_PATH } from "../GitHubService.ts";
import { GitHubStoredTokenSchema, type ResolvedGitHubConfig } from "../schema.ts";

const REDIRECT_URI = `http://127.0.0.1:3000${GITHUB_OAUTH_CALLBACK_PATH}`;

const BASE_CONFIG: ResolvedGitHubConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  clientType: "oauth-app",
  userAgent: "TokenRing",
  accounts: {},
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Replaces global fetch with a router keyed on the request URL. */
function mockFetch(routes: Record<string, () => Response>) {
  const handler = mock(async (input: unknown, _init?: unknown) => {
    const url = typeof input === "string" ? input : String((input as Request).url);
    const route = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!route) throw new Error(`Unexpected fetch to ${url}`);
    return route[1]();
  });
  (globalThis as { fetch: unknown }).fetch = handler;
  return handler;
}

/** Account auth loads in the background, so tests wait for it rather than guessing a delay. */
async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for the expected state");
    await Bun.sleep(5);
  }
}

describe("GitHubService", () => {
  let tempDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join("/tmp", "github-test-"));
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await rm(tempDir, { recursive: true, force: true });
  });

  function createService(config: Partial<ResolvedGitHubConfig> = {}) {
    const app = createTestingApp();
    const service = new GitHubService(app);
    service.reconfigure({ ...BASE_CONFIG, ...config });
    return { app, service };
  }

  describe("createAuthorizationUrl", () => {
    it("requests the account's configured scopes", () => {
      const { service } = createService({
        accounts: {
          work: { baseUrl: "https://api.github.com", scopes: ["repo", "read:org"], login: "octocat" },
        },
      });

      const url = new URL(service.createAuthorizationUrl("work", REDIRECT_URI, { state: "state-123" }));

      expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
      expect(url.searchParams.get("client_id")).toBe("client-id");
      expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
      expect(url.searchParams.get("state")).toBe("state-123");
      expect(url.searchParams.get("scope")).toBe("repo,read:org");
      expect(url.searchParams.get("login")).toBe("octocat");
    });

    it("omits scopes for GitHub Apps, which take permissions from the installation", () => {
      const { service } = createService({
        clientType: "github-app",
        accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo"] } },
      });

      const url = new URL(service.createAuthorizationUrl("work", REDIRECT_URI));

      expect(url.searchParams.has("scope")).toBe(false);
    });

    it("fails with a configuration error when no OAuth client is configured", () => {
      const { service } = createService({
        clientId: undefined,
        clientSecret: undefined,
        accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo"] } },
      });

      expect(service.hasOAuthClient()).toBe(false);
      expect(() => service.createAuthorizationUrl("work", REDIRECT_URI)).toThrow(/client ID and secret/);
    });
  });

  describe("resolveAccountName", () => {
    it("returns undefined when nothing is configured, so requests go out anonymously", () => {
      const { service } = createService();
      expect(service.resolveAccountName()).toBeUndefined();
    });

    it("uses the only configured account", () => {
      const { service } = createService({ accounts: { solo: { baseUrl: "https://api.github.com", scopes: [] } } });
      expect(service.resolveAccountName()).toBe("solo");
    });

    it("uses defaultAccount when several are configured", () => {
      const { service } = createService({
        defaultAccount: "work",
        accounts: {
          work: { baseUrl: "https://api.github.com", scopes: [] },
          personal: { baseUrl: "https://api.github.com", scopes: [] },
        },
      });
      expect(service.resolveAccountName()).toBe("work");
      expect(service.resolveAccountName("personal")).toBe("personal");
    });

    it("refuses to guess between several accounts", () => {
      const { service } = createService({
        accounts: {
          work: { baseUrl: "https://api.github.com", scopes: [] },
          personal: { baseUrl: "https://api.github.com", scopes: [] },
        },
      });
      expect(() => service.resolveAccountName()).toThrow(/Multiple GitHub accounts/);
    });
  });

  describe("completePendingAuthorization", () => {
    function beginAuth() {
      const { service } = createService({ accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo"] } } });
      const { authorizationUrl, waitForCallback } = service.beginAuthorization("work", REDIRECT_URI);
      const state = new URL(authorizationUrl).searchParams.get("state") as string;
      return { service, state, waitForCallback };
    }

    it("resolves the pending callback for a matching state", async () => {
      const { service, state, waitForCallback } = beginAuth();
      const callbackUrl = `${REDIRECT_URI}?state=${state}&code=auth-code`;

      service.completePendingAuthorization(callbackUrl);

      expect(await waitForCallback).toBe(callbackUrl);
    });

    it("rejects when GitHub reports an error", async () => {
      const { service, state, waitForCallback } = beginAuth();

      // Failures reject the waiting sign-in and are raised to the caller, so the
      // browser is told the authorization failed rather than shown a success page.
      expect(() => service.completePendingAuthorization(`${REDIRECT_URI}?state=${state}&error=access_denied&error_description=User+said+no`)).toThrow(
        /User said no/,
      );

      await expect(waitForCallback).rejects.toThrow(/User said no/);
    });

    it("rejects when the redirect URI does not match the pending request", async () => {
      const { service, state, waitForCallback } = beginAuth();

      expect(() => service.completePendingAuthorization(`http://127.0.0.1:9999${GITHUB_OAUTH_CALLBACK_PATH}?state=${state}&code=auth-code`)).toThrow(
        /did not match/,
      );

      await expect(waitForCallback).rejects.toThrow(/did not match/);
    });

    it("rejects a callback carrying no authorization code", async () => {
      const { service, state, waitForCallback } = beginAuth();

      expect(() => service.completePendingAuthorization(`${REDIRECT_URI}?state=${state}`)).toThrow(/did not include an authorization code/);

      await expect(waitForCallback).rejects.toThrow(/did not include an authorization code/);
    });

    it("abandons a pending authorization that is never called back", async () => {
      const { service } = createService({ accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo"] } } });
      const { authorizationUrl, waitForCallback } = service.beginAuthorization("work", REDIRECT_URI, { timeoutMs: 10 });
      const state = new URL(authorizationUrl).searchParams.get("state") as string;

      await expect(waitForCallback).rejects.toThrow(/Timed out waiting for the GitHub OAuth callback/);

      // The abandoned authorization is forgotten, so a late callback finds nothing.
      expect(() => service.completePendingAuthorization(`${REDIRECT_URI}?state=${state}&code=auth-code`)).toThrow(/No pending GitHub authorization/);
    });

    it("throws for an unknown state", () => {
      const { service } = beginAuth();
      expect(() => service.completePendingAuthorization(`${REDIRECT_URI}?state=other&code=auth-code`)).toThrow(/No pending GitHub authorization/);
    });
  });

  it("exchanges the callback code for a token and stores it in the vault", async () => {
    const app = createTestingApp();
    const vault = new VaultService({ vaultFile: path.join(tempDir, "test.vault"), relockTime: 300_000 });
    vault.setPassword("test-password");

    const service = new GitHubService(app);
    service.reconfigure({ ...BASE_CONFIG, accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo", "read:org"] } } });
    app.addServices([vault, service]);

    const callbackResource = new GitHubOAuthCallbackResource(service);
    const { authorizationUrl, waitForCallback } = service.beginAuthorization("work", REDIRECT_URI);
    const state = new URL(authorizationUrl).searchParams.get("state") as string;

    mockFetch({
      "https://github.com/login/oauth/access_token": () => jsonResponse({ access_token: "gho_token", scope: "repo read:org", token_type: "bearer" }),
      "https://api.github.com/user": () =>
        jsonResponse({ login: "octocat", id: 583231, name: "The Octocat", email: null, company: "GitHub", avatar_url: "https://a", html_url: "https://h" }),
    });

    // Drive the callback through the web resource, the way the real web host does.
    const handler = callbackResource.routes[GITHUB_OAUTH_CALLBACK_PATH] as (request: Request) => Promise<Response>;
    const response = await handler(new Request(`${REDIRECT_URI}?state=${state}&code=auth-code`));
    expect(response.status).toBe(200);

    const callbackUrl = await waitForCallback;
    const code = new URL(callbackUrl).searchParams.get("code") as string;
    const status = await service.exchangeAuthorizationCode("work", code, REDIRECT_URI);

    expect(status.isAuthenticated).toBe(true);
    expect(status.usesPersonalAccessToken).toBe(false);
    expect(status.profile?.login).toBe("octocat");

    const stored = vault.requireJsonItem("github", "work", GitHubStoredTokenSchema);
    expect(stored).toMatchObject({
      accessToken: "gho_token",
      grantedScopes: ["repo", "read:org"],
      profile: { login: "octocat", name: "The Octocat" },
    });
  });

  it("serves a failure page when the callback reports that GitHub refused", async () => {
    const { service } = createService({ accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo"] } } });
    const { authorizationUrl, waitForCallback } = service.beginAuthorization("work", REDIRECT_URI);
    const state = new URL(authorizationUrl).searchParams.get("state") as string;

    const handler = new GitHubOAuthCallbackResource(service).routes[GITHUB_OAUTH_CALLBACK_PATH] as (request: Request) => Promise<Response>;
    const response = await handler(new Request(`${REDIRECT_URI}?state=${state}&error=access_denied`));

    expect(response.status).toBe(400);
    expect(await response.text()).toContain("GitHub authentication failed");
    await expect(waitForCallback).rejects.toThrow(/access_denied/);
  });

  it("loads a stored token out of the vault when an account is configured", async () => {
    const app = createTestingApp();
    const vault = new VaultService({ vaultFile: path.join(tempDir, "test.vault"), relockTime: 300_000 });
    vault.setPassword("test-password");
    await vault.setJsonItem("github", "work", { accessToken: "gho_stored", grantedScopes: ["repo"] });

    const service = new GitHubService(app);
    app.addServices([vault, service]);

    const errors: unknown[] = [];
    app.serviceError = ((_service: unknown, message: unknown) => {
      errors.push(message);
    }) as typeof app.serviceError;

    mockFetch({
      "https://api.github.com/user": () =>
        jsonResponse({ login: "octocat", id: 1, name: "The Octocat", email: null, company: null, avatar_url: "https://a", html_url: "https://h" }),
    });

    // Accounts are registered by reconfigure, which must not read an account back
    // before it has been stored — doing so used to report a bogus load failure.
    service.reconfigure({ ...BASE_CONFIG, accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo"] } } });
    await waitFor(() => service.getAccountStatus("work").profile !== undefined);

    expect(errors).toEqual([]);
    expect(service.getAccountStatus("work")).toMatchObject({
      isAuthenticated: true,
      usesPersonalAccessToken: false,
      profile: { login: "octocat" },
    });
  });

  it("keeps a loaded token when the profile lookup fails", async () => {
    const app = createTestingApp();
    const vault = new VaultService({ vaultFile: path.join(tempDir, "test.vault"), relockTime: 300_000 });
    vault.setPassword("test-password");
    await vault.setJsonItem("github", "work", { accessToken: "gho_stored", grantedScopes: ["repo"] });

    const service = new GitHubService(app);
    app.addServices([vault, service]);

    const errors: string[] = [];
    app.serviceError = ((_service: unknown, message: unknown) => {
      errors.push(String(message));
    }) as typeof app.serviceError;

    mockFetch({ "https://api.github.com/user": () => jsonResponse({ message: "Bad credentials" }, 401) });

    service.reconfigure({ ...BASE_CONFIG, accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo"] } } });
    await waitFor(() => errors.length > 0);

    // A profile lookup that fails says nothing about the token itself, so the token
    // stays loaded and the user isn't sent off to re-authenticate.
    expect(errors.join("\n")).toContain("Couldn't fetch the GitHub profile");
    expect(errors.join("\n")).not.toContain("from the vault");
    expect(service.getAccountStatus("work").isAuthenticated).toBe(true);
  });

  it("authenticates with a personal access token without touching the OAuth flow", async () => {
    const { service } = createService({
      accounts: { ci: { baseUrl: "https://api.github.com", scopes: [], token: "ghp_pat" } },
    });

    const fetchMock = mockFetch({
      "https://api.github.com/user": () =>
        jsonResponse({ login: "ci-bot", id: 1, name: null, email: null, company: null, avatar_url: "https://a", html_url: "https://h" }),
    });

    const user = await service.getAuthenticatedUser("ci");

    expect(user.login).toBe("ci-bot");
    expect(service.getAccountStatus("ci")).toMatchObject({ isAuthenticated: true, usesPersonalAccessToken: true });

    const init = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(init?.headers?.authorization).toBe("token ghp_pat");
  });

  it("decodes base64 file content", async () => {
    const { service } = createService({ accounts: { work: { baseUrl: "https://api.github.com", scopes: [], token: "ghp_pat" } } });

    mockFetch({
      "https://api.github.com/repos/octo/repo/contents/README.md": () =>
        jsonResponse({
          type: "file",
          encoding: "base64",
          path: "README.md",
          sha: "abc123",
          size: 11,
          // GitHub wraps base64 payloads at 60 characters; the newlines must be stripped.
          content: `${Buffer.from("hello world").toString("base64").slice(0, 4)}\n${Buffer.from("hello world").toString("base64").slice(4)}\n`,
        }),
    });

    const file = await service.getFile("octo", "repo", "README.md");

    expect(file).toEqual({ path: "README.md", content: "hello world", sha: "abc123", size: 11 });
  });

  it("explains a 401 with a re-authentication hint", async () => {
    const { service } = createService({ accounts: { work: { baseUrl: "https://api.github.com", scopes: [], token: "ghp_expired" } } });

    mockFetch({
      "https://api.github.com/repos/octo/repo": () => jsonResponse({ message: "Bad credentials" }, 401),
    });

    await expect(service.getRepository("octo", "repo")).rejects.toThrow(/not authenticated.*\/github account auth work/s);
  });

  it("explains an exhausted rate limit", async () => {
    const { service } = createService();

    (globalThis as { fetch: unknown }).fetch = mock(
      async () =>
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1700000000",
          },
        }),
    );

    await expect(service.searchRepositories("token ring")).rejects.toThrow(/rate limit.*resets at 2023-11-14/s);
  });
});
