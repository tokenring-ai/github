import { describe, expect, it } from "bun:test";
import { createConnectHarness } from "@tokenring-ai/secrets/test/connectHarness";
import { VAULT_LOCKED_MESSAGE } from "@tokenring-ai/secrets/vaultCredentials";
import GitHubService from "../../GitHubService.ts";
import command from "./github.ts";

const TOKEN = "ghp_secret_token_value";

function setup(options: Parameters<typeof createConnectHarness>[0] = {}) {
  const harness = createConnectHarness(options);
  const lookups: string[] = [];
  harness.addService(GitHubService, {
    hasOAuthClient: () => false,
    getAuthenticatedUser: async (account: string) => {
      lookups.push(account);
      return { login: "octocat" };
    },
  });
  return { harness, lookups };
}

function run(harness: ReturnType<typeof createConnectHarness>, args: Record<string, unknown> = {}) {
  return command.execute({ agent: harness.agent, args: { name: "work", save: "workspace", ...args } } as never);
}

describe("/connect github with a personal access token", () => {
  it("saves the token to the vault and only references it in settings", async () => {
    const { harness, lookups } = setup({ answers: [TOKEN] });
    const output = await run(harness, { login: "octocat" });

    expect(harness.prompts.map(prompt => prompt.masked)).toEqual([true]);
    expect(harness.vault.entries.github).toEqual({ "work.token": TOKEN });
    expect(harness.configuration.overrides.workspace).toEqual({
      github: { accounts: { work: { login: "octocat", token: { source: "vault", category: "github", key: "work.token" } } } },
    });
    expect(harness.settingsContain(TOKEN)).toBe(false);
    expect(output).not.toContain(TOKEN);
    expect(lookups).toEqual(["work"]);
  });

  it("gives the usage message when nobody can answer the token prompt", async () => {
    const { harness, lookups } = setup({ nobodyToAsk: true });
    await expect(run(harness)).rejects.toThrow("Usage: /connect github");
    expect(harness.vault.entries).toEqual({});
    expect(lookups).toEqual([]);
  });

  it("refuses when the vault is locked, saving nothing and asking for nothing", async () => {
    const { harness } = setup({ answers: [TOKEN] });
    harness.vault.writable = false;
    await expect(run(harness)).rejects.toThrow(VAULT_LOCKED_MESSAGE);
    expect(harness.prompts).toEqual([]);
    expect(harness.vault.entries).toEqual({});
    expect(harness.configuration.overrides.workspace).toEqual({});
  });

  it("puts the vault back when the settings can't be saved", async () => {
    const { harness, lookups } = setup({ nobodyToAsk: true });
    harness.vault.entries.github = { "work.token": "previous-token" };
    harness.configuration.reject = "invalid";
    const error = await run(harness, { token: TOKEN }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(TOKEN);
    expect(harness.vault.entries.github).toEqual({ "work.token": "previous-token" });
    expect(harness.configuration.overrides.workspace).toEqual({});
    expect(lookups).toEqual([]);
  });
});
