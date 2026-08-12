import { randomUUID } from "node:crypto";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import { ConfigurationError } from "@tokenring-ai/app/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import VaultService from "@tokenring-ai/vault/VaultService";
import { deepEquals } from "bun";
import { OAuthApp, Octokit, RequestError } from "octokit";
import {
  type GitHubCheckState,
  type GitHubPRCheck,
  type GitHubPRComment,
  type GitHubPRCommentListOptions,
  type GitHubPRCommentOptions,
  type GitHubPRCreateOptions,
  type GitHubPRFileChange,
  type GitHubPRListOptions,
  type GitHubPRReview,
  type GitHubPRReviewOptions,
  type GitHubPRSearchOptions,
  type GitHubPRStatus,
  type GitHubPRUpdateOptions,
  type GitHubPullRequest,
  type GitHubTeam,
  toGitHubPRConversationComment,
  toGitHubPRFileChange,
  toGitHubPRReview,
  toGitHubPRReviewComment,
  toGitHubPullRequest,
  toGitHubTeam,
} from "./pullRequestTypes.ts";
import { type GitHubStoredToken, GitHubStoredTokenSchema, type ResolvedGitHubAccount, type ResolvedGitHubConfig } from "./schema.ts";
import {
  type GitHubIssue,
  type GitHubIssueComment,
  type GitHubIssueCreateOptions,
  type GitHubIssueListOptions,
  type GitHubIssueSearchOptions,
  type GitHubIssueUpdateOptions,
  type GitHubLabel,
  type GitHubUser,
  toGitHubIssue,
  toGitHubIssueComment,
  toGitHubLabel,
  toGitHubUser,
} from "./types.ts";

export type GitHubRepoSearchResult = {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  default_branch: string;
};

export type GitHubRepository = GitHubRepoSearchResult & {
  name: string;
};

export type GitHubFile = {
  path: string;
  content: string;
  sha: string;
  size: number;
};

/** The shape shared by the OAuth App and GitHub App authentications Octokit returns. */
type GitHubUserAuthentication = {
  token: string;
  scopes?: string[] | undefined;
  refreshToken?: string | undefined;
  expiresAt?: string | undefined;
  refreshTokenExpiresAt?: string | undefined;
};

type GitHubRequestOptions = {
  context: string;
  requiredScopes?: string[] | undefined;
  /** Extra guidance appended to the error message for a specific status code. */
  statusHints?: Record<number, string> | undefined;
};

type PendingAuthorization = {
  accountName: string;
  redirectUri: string;
  resolve: (callbackUrl: string) => void;
  reject: (error: Error) => void;
};

const GITHUB_VAULT_CATEGORY = "github";

/** Refresh an expiring token this long before it actually lapses. */
const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;

export const GITHUB_OAUTH_CALLBACK_PATH = "/oauth/github/callback";

/** How long a pending authorization waits for GitHub to call back before it is abandoned. */
const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000;

/** A pull request diff is unbounded; this keeps a large one from swamping a context window. */
const DIFF_MAX_LENGTH = 100_000;

/** Per-file cap inside `getPRFiles`, which returns many patches in one response. */
const FILE_PATCH_MAX_LENGTH = 4_000;

const DEFAULT_PR_FILE_LIMIT = 100;

/** GitHub's largest page for statuses and check runs. */
const CHECK_PAGE_SIZE = 100;

/** Bounds `getPRStatus` on a commit with an implausible number of check runs. */
const MAX_CHECK_PAGES = 5;

/** Scopes GitHub accepts for writes against a repository; either one suffices. */
const REPO_WRITE_SCOPES = ["repo", "public_repo"];

const EMPTY_CONFIG: ResolvedGitHubConfig = {
  clientType: "oauth-app",
  userAgent: "TokenRing",
  accounts: {},
};

export default class GitHubService implements TokenRingService {
  readonly name = "GitHubService";
  description = "Search GitHub repositories and retrieve repository documentation and files";

  private readonly accounts = new KeyedRegistry<ResolvedGitHubAccount>();
  getAvailableAccounts = this.accounts.keysArray;
  requireAccount = this.accounts.require;

  private readonly authData = new Map<string, GitHubStoredToken>();
  private readonly pendingAuthorizations = new Map<string, PendingAuthorization>();
  private vaultService: VaultService | null = null;
  private options: ResolvedGitHubConfig = EMPTY_CONFIG;

  constructor(readonly app: TokenRingApp) {
    app.waitForService(VaultService, async vaultService => {
      this.vaultService = vaultService;

      for (const accountName of this.accounts.keysArray()) {
        await this.loadAccountAuth(accountName);
      }
    });
  }

  reconfigure(options: ResolvedGitHubConfig): void {
    this.options = options;

    const added: string[] = [];
    this.accounts.reconcileAgainst(options.accounts, {
      creating: (name, account) => {
        added.push(name);
        return account;
      },
      deleting: name => {
        this.authData.delete(name);
      },
      updating: (_name, existing, account) => (deepEquals(existing, account, true) ? existing : account),
    });

    // Deferred until reconciliation is done: `reconcileAgainst` calls `creating`
    // before it stores the account, so loading from there wouldn't find it.
    for (const name of added) void this.loadAccountAuth(name);
  }

  getAccountStatus(accountName: string) {
    const account = this.requireAccount(accountName);
    const auth = this.authData.get(accountName);

    return {
      isAuthenticated: Boolean(account.token) || Boolean(auth?.accessToken),
      usesPersonalAccessToken: Boolean(account.token),
      grantedScopes: auth?.grantedScopes,
      profile: auth?.profile,
      account,
    };
  }

  /** Whether OAuth app credentials are configured, i.e. whether the sign-in flow can run at all. */
  hasOAuthClient(): boolean {
    return Boolean(this.options.clientId && this.options.clientSecret);
  }

  requireAuthorizedAccount(accountName: string) {
    const authStatus = this.getAccountStatus(accountName);
    if (!authStatus.isAuthenticated) {
      throw new ConfigurationError(
        this.name,
        `GitHub account ${accountName} is not authenticated. Please authenticate with /github account auth ${accountName}`,
      );
    }
    return authStatus;
  }

  /**
   * Picks the account a request should run as. Returns undefined when nothing is
   * configured, in which case requests go out unauthenticated against the much
   * lower anonymous rate limit.
   */
  resolveAccountName(accountName?: string): string | undefined {
    if (accountName) {
      void this.requireAccount(accountName);
      return accountName;
    }

    if (this.options.defaultAccount) {
      void this.requireAccount(this.options.defaultAccount);
      return this.options.defaultAccount;
    }

    const names = this.accounts.keysArray();
    if (names.length > 1) {
      throw new ConfigurationError(
        this.name,
        `Multiple GitHub accounts are configured (${names.join(", ")}). Pass an account explicitly, or set github.defaultAccount.`,
      );
    }
    return names[0];
  }

  createAuthorizationUrl(
    accountName: string,
    redirectUri: string,
    options: { state?: string | undefined; scopes?: string[] | undefined; login?: string | undefined } = {},
  ): string {
    const account = this.requireAccount(accountName);
    const oauthApp = this.createOAuthApp(redirectUri);
    const login = options.login ?? account.login;

    if (this.options.clientType === "github-app") {
      // GitHub Apps derive their permissions from the installation, so they take no scopes.
      const { url } = oauthApp.getWebFlowAuthorizationUrl(stripUndefinedKeys({ redirectUrl: redirectUri, state: options.state, login }));
      return url;
    }

    const { url } = oauthApp.getWebFlowAuthorizationUrl(
      stripUndefinedKeys({
        redirectUrl: redirectUri,
        state: options.state,
        scopes: options.scopes ?? account.scopes,
        login,
      }),
    );
    return url;
  }

  /**
   * Starts the OAuth web flow. The returned promise settles when GitHub calls
   * back, and is abandoned after `timeoutMs` so a sign-in the user never
   * finished doesn't leak a pending authorization.
   */
  beginAuthorization(
    accountName: string,
    redirectUri: string,
    options: { timeoutMs?: number | undefined } = {},
  ): {
    authorizationUrl: string;
    waitForCallback: Promise<string>;
  } {
    this.requireAccount(accountName);

    const state = randomUUID();
    const waitForCallback = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAuthorizations.delete(state);
        reject(new Error(`Timed out waiting for the GitHub OAuth callback for "${accountName}"`));
      }, options.timeoutMs ?? AUTHORIZATION_TIMEOUT_MS);
      // Waiting on a browser round trip is no reason to hold the process open.
      timer.unref();

      const complete = (callback: () => void) => {
        clearTimeout(timer);
        this.pendingAuthorizations.delete(state);
        callback();
      };

      this.pendingAuthorizations.set(state, {
        accountName,
        redirectUri,
        resolve: callbackUrl => complete(() => resolve(callbackUrl)),
        reject: error => complete(() => reject(error)),
      });
    });

    return {
      authorizationUrl: this.createAuthorizationUrl(accountName, redirectUri, { state }),
      waitForCallback,
    };
  }

  /**
   * Hands a received callback to the sign-in that is waiting for it. Throws on
   * every failure — including the ones that also reject the waiting sign-in —
   * so the HTTP route serving the callback can tell the browser what went wrong
   * instead of reporting success for an authorization that never completed.
   */
  completePendingAuthorization(callbackUrl: string): void {
    const callback = new URL(callbackUrl);
    const state = callback.searchParams.get("state");
    if (!state) {
      throw new ConfigurationError(this.name, "The GitHub OAuth callback is missing its state parameter.");
    }

    const pending = this.pendingAuthorizations.get(state);
    if (!pending) {
      throw new ConfigurationError(this.name, "No pending GitHub authorization was found for this callback.");
    }

    /** Fails the waiting sign-in and the request that delivered the callback alike. */
    const fail = (message: string): never => {
      const error = new Error(message);
      pending.reject(error);
      throw error;
    };

    if (`${callback.origin}${callback.pathname}` !== pending.redirectUri) {
      fail("The GitHub OAuth callback redirect URI did not match the pending authorization request.");
    }

    const authError = callback.searchParams.get("error_description") ?? callback.searchParams.get("error");
    if (authError) {
      fail(`GitHub authorization failed: ${authError}`);
    }

    if (!callback.searchParams.get("code")) {
      fail("The GitHub OAuth callback did not include an authorization code.");
    }

    pending.resolve(callbackUrl);
  }

  async exchangeAuthorizationCode(accountName: string, code: string, redirectUri: string) {
    void this.requireAccount(accountName);
    const oauthApp = this.createOAuthApp(redirectUri);

    try {
      const { authentication } = await oauthApp.createToken({ code, redirectUrl: redirectUri });
      await this.storeAuthentication(accountName, authentication);
    } catch (error: unknown) {
      throw this.createRequestFailure(`exchange the GitHub auth code for ${accountName}`, error);
    }

    await this.syncAccountProfile(accountName);
    return this.getAccountStatus(accountName);
  }

  /** Revokes the stored OAuth token with GitHub and forgets it locally. */
  async revokeAuthorization(accountName: string): Promise<void> {
    void this.requireAccount(accountName);
    const token = this.authData.get(accountName)?.accessToken;

    if (token) {
      try {
        await this.createOAuthApp().deleteToken({ token });
      } catch (error: unknown) {
        // A token GitHub has already forgotten is still a successful revocation.
        if (!(error instanceof RequestError) || error.status !== 404) {
          throw this.createRequestFailure(`revoke the GitHub token for ${accountName}`, error);
        }
      }
    }

    this.authData.delete(accountName);
    if (this.vaultService?.getSecret(GITHUB_VAULT_CATEGORY, accountName) !== undefined) {
      await this.vaultService.deleteItem(GITHUB_VAULT_CATEGORY, accountName);
    }
  }

  /** Runs an operation against an Octokit client authenticated as the given account. */
  async withOctokit<T>(accountName: string | undefined, request: GitHubRequestOptions, operation: (octokit: Octokit) => Promise<T>): Promise<T> {
    const octokit = await this.createOctokit(accountName);

    try {
      return await operation(octokit);
    } catch (error: unknown) {
      throw this.normalizeGitHubRequestError(accountName, request, error);
    }
  }

  async getAuthenticatedUser(accountName: string) {
    return await this.withOctokit(accountName, { context: `fetch the GitHub profile for ${accountName}` }, async octokit => {
      const { data } = await octokit.rest.users.getAuthenticated();
      return data;
    });
  }

  async searchRepositories(
    query: string,
    options: {
      account?: string | undefined;
      limit?: number | undefined;
      sort?: "stars" | "updated";
      order?: "asc" | "desc";
    } = {},
  ): Promise<GitHubRepoSearchResult[]> {
    if (!query.trim()) throw new Error("query is required");
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: "GitHub repository search" }, async octokit => {
      const { data } = await octokit.rest.search.repos({
        q: query,
        per_page: options.limit ?? 10,
        sort: options.sort ?? "stars",
        order: options.order ?? "desc",
      });

      return data.items.map(repo => ({
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        stargazers_count: repo.stargazers_count,
        language: repo.language ?? null,
        default_branch: repo.default_branch,
      }));
    });
  }

  async getRepository(owner: string, repo: string, options: { account?: string | undefined } = {}): Promise<GitHubRepository> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub repository lookup for ${owner}/${repo}` }, async octokit => {
      const { data } = await octokit.rest.repos.get({ owner, repo });
      return {
        name: data.name,
        full_name: data.full_name,
        description: data.description,
        html_url: data.html_url,
        stargazers_count: data.stargazers_count,
        language: data.language ?? null,
        default_branch: data.default_branch,
      };
    });
  }

  async getFile(owner: string, repo: string, path: string, ref?: string, options: { account?: string | undefined } = {}): Promise<GitHubFile> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub file retrieval for ${owner}/${repo}:${path}` }, async octokit => {
      const { data } = await octokit.rest.repos.getContent(stripUndefinedKeys({ owner, repo, path, ref }));

      if (Array.isArray(data) || data.type !== "file") {
        throw new Error(`Path ${path} in ${owner}/${repo} is not a file`);
      }
      if (data.encoding !== "base64") {
        throw new Error(`Path ${path} in ${owner}/${repo} did not return base64 file content`);
      }

      return {
        path: data.path,
        content: Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8"),
        sha: data.sha,
        size: data.size,
      };
    });
  }

  async getRepositoryDocumentation(
    owner: string,
    repo: string,
    options: { account?: string | undefined; ref?: string | undefined; maxFiles?: number | undefined } = {},
  ): Promise<{
    repository: string;
    branch: string;
    files: Array<{ path: string; size: number; content: string }>;
  }> {
    const accountName = this.resolveAccountName(options.account);
    const repository = await this.getRepository(owner, repo, { account: accountName });
    const branch = options.ref ?? repository.default_branch;

    const tree = await this.withOctokit(accountName, { context: `GitHub tree retrieval for ${owner}/${repo}` }, async octokit => {
      const { data } = await octokit.rest.git.getTree({ owner, repo, tree_sha: branch, recursive: "1" });
      return data.tree;
    });

    const candidates = this.rankDocumentationFiles(tree);
    const selected = candidates.slice(0, options.maxFiles ?? 5);
    if (selected.length === 0) {
      throw new Error(`No documentation files found for ${owner}/${repo}`);
    }

    // One unreadable file (too large, submodule, transient failure) shouldn't sink the whole batch.
    const results = await Promise.allSettled(selected.map(file => this.getFile(owner, repo, file.path, branch, { account: accountName })));
    const files = results.filter(result => result.status === "fulfilled").map(result => result.value);

    if (files.length === 0) {
      const [firstFailure] = results;
      throw new Error(
        `Failed to retrieve any documentation files for ${owner}/${repo}`,
        firstFailure?.status === "rejected" ? { cause: firstFailure.reason } : undefined,
      );
    }

    return {
      repository: `${owner}/${repo}`,
      branch,
      files: files.map(file => ({
        path: file.path,
        size: file.size,
        content: file.content,
      })),
    };
  }

  async listIssues(owner: string, repo: string, options: GitHubIssueListOptions = {}): Promise<GitHubIssue[]> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub issue listing for ${owner}/${repo}` }, async octokit => {
      const { data } = await octokit.rest.issues.listForRepo(
        stripUndefinedKeys({
          owner,
          repo,
          state: options.state ?? "open",
          labels: options.labels?.length ? options.labels.join(",") : undefined,
          sort: options.sort ?? "created",
          direction: options.order ?? "desc",
          per_page: options.perPage ?? 30,
          page: options.page,
          since: options.since,
          assignee: options.assignee,
          creator: options.creator,
          mentioned: options.mentioned,
          milestone: options.milestone,
        }),
      );

      const issues = data.map(toGitHubIssue);
      // GitHub's issues endpoint returns pull requests too; callers asking for
      // issues almost never want them, so they're dropped unless requested.
      return options.includePullRequests ? issues : issues.filter(issue => !issue.isPullRequest);
    });
  }

  async getIssue(owner: string, repo: string, issueNumber: number, options: { account?: string | undefined } = {}): Promise<GitHubIssue> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub issue lookup for ${owner}/${repo}#${issueNumber}` }, async octokit => {
      const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber });
      return toGitHubIssue(data);
    });
  }

  async createIssue(owner: string, repo: string, options: GitHubIssueCreateOptions): Promise<GitHubIssue> {
    const accountName = this.resolveAccountName(options.account);
    if (!options.title.trim()) throw new Error("An issue title is required");

    return await this.withOctokit(
      accountName,
      { context: `GitHub issue creation in ${owner}/${repo}`, requiredScopes: ["repo", "public_repo"] },
      async octokit => {
        const { data } = await octokit.rest.issues.create(
          stripUndefinedKeys({
            owner,
            repo,
            title: options.title,
            body: options.body,
            labels: options.labels,
            assignees: options.assignees,
            milestone: options.milestone,
          }),
        );
        return toGitHubIssue(data);
      },
    );
  }

  async updateIssue(owner: string, repo: string, issueNumber: number, options: GitHubIssueUpdateOptions): Promise<GitHubIssue> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(
      accountName,
      { context: `GitHub issue update for ${owner}/${repo}#${issueNumber}`, requiredScopes: ["repo", "public_repo"] },
      async octokit => {
        const { data } = await octokit.rest.issues.update(
          stripUndefinedKeys({
            owner,
            repo,
            issue_number: issueNumber,
            title: options.title,
            body: options.body,
            state: options.state,
            state_reason: options.stateReason,
            labels: options.labels,
            assignees: options.assignees,
            // null is meaningful here: it clears the milestone.
            milestone: options.milestone,
          }),
        );
        return toGitHubIssue(data);
      },
    );
  }

  async addIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
    options: { account?: string | undefined } = {},
  ): Promise<GitHubIssueComment> {
    const accountName = this.resolveAccountName(options.account);
    if (!body.trim()) throw new Error("A comment body is required");

    return await this.withOctokit(
      accountName,
      { context: `GitHub issue comment on ${owner}/${repo}#${issueNumber}`, requiredScopes: ["repo", "public_repo"] },
      async octokit => {
        const { data } = await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
        return toGitHubIssueComment(data);
      },
    );
  }

  async listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
    options: { account?: string | undefined; perPage?: number | undefined; page?: number | undefined } = {},
  ): Promise<GitHubIssueComment[]> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub comment listing for ${owner}/${repo}#${issueNumber}` }, async octokit => {
      const { data } = await octokit.rest.issues.listComments(
        stripUndefinedKeys({ owner, repo, issue_number: issueNumber, per_page: options.perPage ?? 30, page: options.page }),
      );
      return data.map(toGitHubIssueComment);
    });
  }

  /**
   * Searches issues across repositories with GitHub's search API, which has its
   * own rate limit and query syntax. The query is passed through unchanged, so
   * qualifiers like `repo:owner/name`, `is:open`, and `label:bug` all work.
   */
  async searchIssues(query: string, options: GitHubIssueSearchOptions = {}): Promise<GitHubIssue[]> {
    if (!query.trim()) throw new Error("query is required");
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: "GitHub issue search" }, async octokit => {
      const { data } = await octokit.rest.search.issuesAndPullRequests(
        stripUndefinedKeys({
          q: query,
          sort: options.sort,
          order: options.order ?? "desc",
          per_page: options.perPage ?? 30,
          page: options.page,
          // Opt in to the current search behaviour; the legacy one is deprecated.
          advanced_search: "true",
        }),
      );
      return data.items.map(toGitHubIssue);
    });
  }

  async listLabels(
    owner: string,
    repo: string,
    options: { account?: string | undefined; perPage?: number | undefined; page?: number | undefined } = {},
  ): Promise<GitHubLabel[]> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub label listing for ${owner}/${repo}` }, async octokit => {
      const { data } = await octokit.rest.issues.listLabelsForRepo(stripUndefinedKeys({ owner, repo, per_page: options.perPage ?? 100, page: options.page }));
      return data.map(toGitHubLabel);
    });
  }

  async addLabels(owner: string, repo: string, issueNumber: number, labels: string[], options: { account?: string | undefined } = {}): Promise<GitHubLabel[]> {
    const accountName = this.resolveAccountName(options.account);
    if (labels.length === 0) throw new Error("At least one label is required");

    return await this.withOctokit(
      accountName,
      { context: `GitHub label addition on ${owner}/${repo}#${issueNumber}`, requiredScopes: ["repo", "public_repo"] },
      async octokit => {
        const { data } = await octokit.rest.issues.addLabels({ owner, repo, issue_number: issueNumber, labels });
        return data.map(toGitHubLabel);
      },
    );
  }

  async removeLabel(owner: string, repo: string, issueNumber: number, label: string, options: { account?: string | undefined } = {}): Promise<GitHubLabel[]> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(
      accountName,
      { context: `GitHub label removal on ${owner}/${repo}#${issueNumber}`, requiredScopes: ["repo", "public_repo"] },
      async octokit => {
        const { data } = await octokit.rest.issues.removeLabel({ owner, repo, issue_number: issueNumber, name: label });
        return data.map(toGitHubLabel);
      },
    );
  }

  async listPullRequests(owner: string, repo: string, options: GitHubPRListOptions = {}): Promise<GitHubPullRequest[]> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub pull request listing for ${owner}/${repo}` }, async octokit => {
      const { data } = await octokit.rest.pulls.list(
        stripUndefinedKeys({
          owner,
          repo,
          state: options.state ?? "open",
          head: options.head,
          base: options.base,
          sort: options.sort ?? "created",
          direction: options.direction ?? "desc",
          per_page: options.perPage ?? 30,
          page: options.page,
        }),
      );

      const pulls = data.map(toGitHubPullRequest);
      if (!options.labels?.length) return pulls;

      // Unlike the issues endpoint, GitHub's pulls endpoint takes no label
      // filter, so this narrows the page that came back rather than the query.
      const wanted = new Set(options.labels.map(label => label.toLowerCase()));
      return pulls.filter(pull => pull.labels.some(label => wanted.has(label.name.toLowerCase())));
    });
  }

  /** The only call that populates the diff stats, mergeability, and comment counts. */
  async getPullRequest(owner: string, repo: string, prNumber: number, options: { account?: string | undefined } = {}): Promise<GitHubPullRequest> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub pull request lookup for ${owner}/${repo}#${prNumber}` }, async octokit => {
      const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
      return toGitHubPullRequest(data);
    });
  }

  async createPullRequest(owner: string, repo: string, options: GitHubPRCreateOptions): Promise<GitHubPullRequest> {
    const accountName = this.resolveAccountName(options.account);
    if (!options.title.trim()) throw new Error("A pull request title is required");
    if (!options.head.trim()) throw new Error("A head branch is required");
    if (!options.base.trim()) throw new Error("A base branch is required");

    return await this.withOctokit(
      accountName,
      {
        context: `GitHub pull request creation in ${owner}/${repo}`,
        requiredScopes: REPO_WRITE_SCOPES,
        statusHints: {
          422: `Check that "${options.head}" exists, differs from "${options.base}", and has no open pull request already.`,
        },
      },
      async octokit => {
        const { data } = await octokit.rest.pulls.create(
          stripUndefinedKeys({
            owner,
            repo,
            title: options.title,
            body: options.body,
            head: options.head,
            base: options.base,
            draft: options.draft,
            maintainer_can_modify: options.maintainerCanModify,
          }),
        );
        return toGitHubPullRequest(data);
      },
    );
  }

  /**
   * Applies an update across the three endpoints that own the different parts of
   * a pull request, then re-reads it so the caller gets one consistent result.
   */
  async updatePullRequest(owner: string, repo: string, prNumber: number, options: GitHubPRUpdateOptions): Promise<GitHubPullRequest> {
    const accountName = this.resolveAccountName(options.account);
    const { account: _account, labels, assignees, milestone, reviewers, teamReviewers, ...pullFields } = options;

    if (pullFields.title !== undefined || pullFields.body !== undefined || pullFields.state !== undefined || pullFields.base !== undefined) {
      await this.withOctokit(
        accountName,
        { context: `GitHub pull request update for ${owner}/${repo}#${prNumber}`, requiredScopes: REPO_WRITE_SCOPES },
        async octokit => {
          await octokit.rest.pulls.update(stripUndefinedKeys({ owner, repo, pull_number: prNumber, ...pullFields }));
        },
      );
    }

    // Labels, assignees, and milestones belong to the issue behind the pull request.
    if (labels !== undefined || assignees !== undefined || milestone !== undefined) {
      await this.updateIssue(owner, repo, prNumber, stripUndefinedKeys({ account: accountName, labels, assignees, milestone }));
    }

    if (reviewers?.length || teamReviewers?.length) {
      await this.addPRReviewers(owner, repo, prNumber, reviewers ?? [], teamReviewers, stripUndefinedKeys({ account: accountName }));
    }

    return await this.getPullRequest(owner, repo, prNumber, stripUndefinedKeys({ account: accountName }));
  }

  /** Closes without merging. Reopen by calling `updatePullRequest` with `state: "open"`. */
  async closePullRequest(owner: string, repo: string, prNumber: number, options: { account?: string | undefined } = {}): Promise<GitHubPullRequest> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(
      accountName,
      { context: `GitHub pull request close for ${owner}/${repo}#${prNumber}`, requiredScopes: REPO_WRITE_SCOPES },
      async octokit => {
        const { data } = await octokit.rest.pulls.update({ owner, repo, pull_number: prNumber, state: "closed" });
        return toGitHubPullRequest(data);
      },
    );
  }

  async reviewPullRequest(owner: string, repo: string, prNumber: number, options: GitHubPRReviewOptions): Promise<GitHubPRReview> {
    const accountName = this.resolveAccountName(options.account);
    const body = options.body?.trim();

    // GitHub rejects both of these without a body; saying so here beats a bare 422.
    if (!body && options.event !== "APPROVE") {
      throw new Error(`A review body is required when the review event is ${options.event}`);
    }

    return await this.withOctokit(
      accountName,
      {
        context: `GitHub pull request review on ${owner}/${repo}#${prNumber}`,
        requiredScopes: REPO_WRITE_SCOPES,
        statusHints: { 422: "GitHub does not allow reviewing your own pull request, or one that is already closed." },
      },
      async octokit => {
        const { data } = await octokit.rest.pulls.createReview(
          stripUndefinedKeys({ owner, repo, pull_number: prNumber, event: options.event, body, commit_id: options.commitId }),
        );
        return toGitHubPRReview(data);
      },
    );
  }

  /**
   * Posts on the conversation thread, or inline on a file when `path` is given.
   * GitHub stores those as two different kinds of comment on two endpoints.
   */
  async commentPullRequest(owner: string, repo: string, prNumber: number, body: string, options: GitHubPRCommentOptions = {}): Promise<GitHubPRComment> {
    const accountName = this.resolveAccountName(options.account);
    if (!body.trim()) throw new Error("A comment body is required");

    if (options.inReplyTo !== undefined) {
      return await this.withOctokit(
        accountName,
        { context: `GitHub review comment reply on ${owner}/${repo}#${prNumber}`, requiredScopes: REPO_WRITE_SCOPES },
        async octokit => {
          const { data } = await octokit.rest.pulls.createReplyForReviewComment({
            owner,
            repo,
            pull_number: prNumber,
            comment_id: options.inReplyTo as number,
            body,
          });
          return toGitHubPRReviewComment(data);
        },
      );
    }

    if (!options.path) {
      const comment = await this.addIssueComment(owner, repo, prNumber, body, stripUndefinedKeys({ account: accountName }));
      return toGitHubPRConversationComment(comment);
    }

    // Commenting on a whole file needs no line number; commenting on a line does.
    const subjectType = options.subjectType ?? (options.line === undefined ? "file" : "line");
    if (subjectType === "line" && options.line === undefined) {
      throw new Error('An inline comment needs a line number, or subjectType: "file" to comment on the whole file');
    }

    // Review comments are anchored to a commit; default to whatever the branch is at now.
    const commitId = options.commitId ?? (await this.getPullRequest(owner, repo, prNumber, stripUndefinedKeys({ account: accountName }))).head.sha;

    return await this.withOctokit(
      accountName,
      {
        context: `GitHub review comment on ${owner}/${repo}#${prNumber}`,
        requiredScopes: REPO_WRITE_SCOPES,
        statusHints: { 422: `Line ${options.line} of ${options.path} may not be part of this pull request's diff.` },
      },
      async octokit => {
        const { data } = await octokit.rest.pulls.createReviewComment(
          stripUndefinedKeys({
            owner,
            repo,
            pull_number: prNumber,
            body,
            path: options.path,
            commit_id: commitId,
            line: options.line,
            start_line: options.startLine,
            side: options.side,
            subject_type: subjectType,
          }),
        );
        return toGitHubPRReviewComment(data);
      },
    );
  }

  /**
   * A pull request's discussion lives in two places: inline review comments and
   * the conversation thread, which GitHub stores as issue comments. Both are
   * returned by default, interleaved by creation time as the web UI shows them.
   */
  async listPRComments(owner: string, repo: string, prNumber: number, options: GitHubPRCommentListOptions = {}): Promise<GitHubPRComment[]> {
    const accountName = this.resolveAccountName(options.account);
    const include = options.include ?? "all";
    const perPage = options.perPage ?? 30;
    const comments: GitHubPRComment[] = [];

    if (include !== "conversation") {
      const reviewComments = await this.withOctokit(
        accountName,
        { context: `GitHub review comment listing for ${owner}/${repo}#${prNumber}` },
        async octokit => {
          const { data } = await octokit.rest.pulls.listReviewComments(
            stripUndefinedKeys({ owner, repo, pull_number: prNumber, per_page: perPage, page: options.page }),
          );
          return data.map(toGitHubPRReviewComment);
        },
      );
      comments.push(...reviewComments);
    }

    if (include !== "review") {
      const thread = await this.listIssueComments(owner, repo, prNumber, stripUndefinedKeys({ account: accountName, perPage, page: options.page }));
      comments.push(...thread.map(toGitHubPRConversationComment));
    }

    return comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async listPRReviews(
    owner: string,
    repo: string,
    prNumber: number,
    options: { account?: string | undefined; perPage?: number | undefined; page?: number | undefined } = {},
  ): Promise<GitHubPRReview[]> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub review listing for ${owner}/${repo}#${prNumber}` }, async octokit => {
      const { data } = await octokit.rest.pulls.listReviews(
        stripUndefinedKeys({ owner, repo, pull_number: prNumber, per_page: options.perPage ?? 30, page: options.page }),
      );
      return data.map(toGitHubPRReview);
    });
  }

  /**
   * Fetches the unified diff. Diffs are unbounded, so the result is capped and
   * `paths` can narrow it to the files that matter before the cap applies.
   */
  async getPRDiff(
    owner: string,
    repo: string,
    prNumber: number,
    options: { account?: string | undefined; paths?: string[] | undefined; maxLength?: number | undefined } = {},
  ): Promise<string> {
    const accountName = this.resolveAccountName(options.account);

    const diff = await this.withOctokit(
      accountName,
      {
        context: `GitHub diff retrieval for ${owner}/${repo}#${prNumber}`,
        statusHints: { 406: "The diff is too large for GitHub to generate. Narrow it with paths, or use getPRFiles instead." },
      },
      async octokit => {
        const response = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber, mediaType: { format: "diff" } });
        // The diff media type returns raw text, but Octokit still types the
        // response body as the pull request object.
        return response.data as unknown as string;
      },
    );

    const filtered = options.paths?.length ? filterDiffByPaths(diff, options.paths) : diff;
    return intelligentTruncate(filtered, { maxLength: options.maxLength ?? DIFF_MAX_LENGTH, suffix: "\n\n… (diff truncated)" });
  }

  async getPRFiles(
    owner: string,
    repo: string,
    prNumber: number,
    options: { account?: string | undefined; perPage?: number | undefined; page?: number | undefined } = {},
  ): Promise<GitHubPRFileChange[]> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub file listing for ${owner}/${repo}#${prNumber}` }, async octokit => {
      const { data } = await octokit.rest.pulls.listFiles(
        stripUndefinedKeys({ owner, repo, pull_number: prNumber, per_page: options.perPage ?? DEFAULT_PR_FILE_LIMIT, page: options.page }),
      );

      return data.map(file => {
        const change = toGitHubPRFileChange(file);
        if (change.patch === undefined) return change;
        // Every file's hunks arrive in one response, so each is capped on its own.
        return { ...change, patch: intelligentTruncate(change.patch, { maxLength: FILE_PATCH_MAX_LENGTH, suffix: "\n… (patch truncated)" }) };
      });
    });
  }

  /**
   * Rolls up CI for a pull request's head commit. Legacy commit statuses and
   * Actions check runs are separate APIs, and a repository may use either, so
   * both are fetched and merged — checking only one reports an empty result for
   * half the repositories out there.
   */
  async getPRStatus(owner: string, repo: string, prNumber: number, options: { account?: string | undefined } = {}): Promise<GitHubPRStatus> {
    const accountName = this.resolveAccountName(options.account);
    const pull = await this.getPullRequest(owner, repo, prNumber, stripUndefinedKeys({ account: accountName }));
    const sha = pull.head.sha;

    return await this.withOctokit(accountName, { context: `GitHub status lookup for ${owner}/${repo}#${prNumber}` }, async octokit => {
      // The combined status endpoint answers with a rollup object rather than a
      // list, so it is simply asked for the largest page it will serve.
      const [combined, firstCheckPage] = await Promise.all([
        octokit.rest.repos.getCombinedStatusForRef({ owner, repo, ref: sha, per_page: CHECK_PAGE_SIZE }),
        octokit.rest.checks.listForRef({ owner, repo, ref: sha, per_page: CHECK_PAGE_SIZE, page: 1 }),
      ]);

      // Check runs are paged through, because stopping at the first page would
      // hide a failing check behind a page boundary and roll the whole pull
      // request up as passing.
      const checkRunList = [...firstCheckPage.data.check_runs];
      for (let page = 2; checkRunList.length < firstCheckPage.data.total_count && page <= MAX_CHECK_PAGES; page++) {
        const { data } = await octokit.rest.checks.listForRef({ owner, repo, ref: sha, per_page: CHECK_PAGE_SIZE, page });
        if (data.check_runs.length === 0) break;
        checkRunList.push(...data.check_runs);
      }

      const statuses: GitHubPRCheck[] = combined.data.statuses.map(status =>
        stripUndefinedKeys({
          source: "status" as const,
          context: status.context,
          description: status.description ?? "",
          state: normalizeCheckState(status.state),
          target_url: status.target_url ?? undefined,
          created_at: status.created_at,
          updated_at: status.updated_at,
        }),
      );

      const checkRuns: GitHubPRCheck[] = checkRunList.map(run =>
        stripUndefinedKeys({
          source: "check_run" as const,
          context: run.name,
          description: run.output.title ?? run.conclusion ?? run.status,
          state: checkRunState(run.status, run.conclusion),
          target_url: run.html_url ?? undefined,
          created_at: run.started_at ?? undefined,
          updated_at: run.completed_at ?? undefined,
        }),
      );

      const all = [...statuses, ...checkRuns];
      return { state: rollupCheckState(all), sha, total: all.length, statuses: all };
    });
  }

  /**
   * Searches pull requests across repositories. GitHub's search API covers issues
   * and pull requests together, so `is:pr` is added unless the query already says
   * which it wants. Results are issue-shaped, so the detail-only fields stay unset.
   */
  async searchPullRequests(query: string, options: GitHubPRSearchOptions = {}): Promise<GitHubPullRequest[]> {
    if (!query.trim()) throw new Error("query is required");
    const accountName = this.resolveAccountName(options.account);
    const q = /\b(is|type):(pr|issue)\b/.test(query) ? query : `${query} is:pr`;

    return await this.withOctokit(accountName, { context: "GitHub pull request search" }, async octokit => {
      const { data } = await octokit.rest.search.issuesAndPullRequests(
        stripUndefinedKeys({
          q,
          sort: options.sort,
          order: options.order ?? "desc",
          per_page: options.perPage ?? 30,
          page: options.page,
          // Opt in to the current search behaviour; the legacy one is deprecated.
          advanced_search: "true",
        }),
      );
      return data.items.map(toGitHubPullRequest);
    });
  }

  async addPRReviewers(
    owner: string,
    repo: string,
    prNumber: number,
    reviewers: string[],
    teamReviewers?: string[],
    options: { account?: string | undefined } = {},
  ): Promise<GitHubPullRequest> {
    const accountName = this.resolveAccountName(options.account);
    if (reviewers.length === 0 && !teamReviewers?.length) {
      throw new Error("At least one reviewer or team reviewer is required");
    }

    return await this.withOctokit(
      accountName,
      {
        context: `GitHub reviewer request on ${owner}/${repo}#${prNumber}`,
        requiredScopes: REPO_WRITE_SCOPES,
        statusHints: { 422: "Reviewers must have access to the repository, and the pull request's author cannot review it." },
      },
      async octokit => {
        const { data } = await octokit.rest.pulls.requestReviewers(
          stripUndefinedKeys({
            owner,
            repo,
            pull_number: prNumber,
            reviewers: reviewers.length > 0 ? reviewers : undefined,
            team_reviewers: teamReviewers?.length ? teamReviewers : undefined,
          }),
        );
        return toGitHubPullRequest(data);
      },
    );
  }

  /** Who has been asked to review but hasn't submitted a review yet. */
  async listRequestedReviewers(
    owner: string,
    repo: string,
    prNumber: number,
    options: { account?: string | undefined } = {},
  ): Promise<{ users: GitHubUser[]; teams: GitHubTeam[] }> {
    const accountName = this.resolveAccountName(options.account);

    return await this.withOctokit(accountName, { context: `GitHub reviewer listing for ${owner}/${repo}#${prNumber}` }, async octokit => {
      const { data } = await octokit.rest.pulls.listRequestedReviewers({ owner, repo, pull_number: prNumber });
      return {
        users: data.users.map(toGitHubUser).filter((user): user is GitHubUser => user !== null),
        teams: data.teams.map(toGitHubTeam),
      };
    });
  }

  private async createOctokit(accountName: string | undefined): Promise<Octokit> {
    const account = accountName ? this.requireAccount(accountName) : undefined;
    const auth = accountName ? await this.getAccessToken(accountName) : undefined;

    return new Octokit(
      stripUndefinedKeys({
        auth,
        baseUrl: account?.baseUrl,
        userAgent: this.options.userAgent,
      }),
    );
  }

  /** Returns the token to authenticate as, refreshing an expiring one along the way. */
  private async getAccessToken(accountName: string): Promise<string | undefined> {
    const account = this.requireAccount(accountName);
    if (account.token) return account.token;

    const auth = this.authData.get(accountName);
    if (!auth?.accessToken) return undefined;

    const expiresSoon = auth.expiryDate !== undefined && auth.expiryDate - Date.now() < TOKEN_REFRESH_WINDOW_MS;
    if (!expiresSoon) return auth.accessToken;

    if (!auth.refreshToken) {
      throw new ConfigurationError(
        this.name,
        `The GitHub access token for "${accountName}" has expired. Re-authenticate with /github account auth ${accountName}`,
      );
    }

    return await this.refreshAccessToken(accountName, auth.refreshToken);
  }

  private async refreshAccessToken(accountName: string, refreshToken: string): Promise<string> {
    try {
      const { authentication } = await this.createOAuthApp().refreshToken({ refreshToken });
      await this.storeAuthentication(accountName, authentication);
      return authentication.token;
    } catch (error: unknown) {
      throw this.createRequestFailure(`refresh the GitHub access token for ${accountName} (re-authenticate with /github account auth ${accountName})`, error);
    }
  }

  private createOAuthApp(redirectUri?: string) {
    const { clientId, clientSecret } = this.options;
    if (!clientId || !clientSecret) {
      throw new ConfigurationError(
        this.name,
        "GitHub OAuth requires a client ID and secret. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or configure github.clientId and github.clientSecret.",
      );
    }

    const common = { clientId, clientSecret, ...(redirectUri !== undefined && { redirectUrl: redirectUri }) };
    return this.options.clientType === "github-app"
      ? new OAuthApp({ clientType: "github-app", ...common })
      : new OAuthApp({ clientType: "oauth-app", ...common });
  }

  private async storeAuthentication(accountName: string, authentication: GitHubUserAuthentication): Promise<void> {
    const previous = this.authData.get(accountName);

    this.authData.set(
      accountName,
      stripUndefinedKeys({
        ...previous,
        accessToken: authentication.token,
        refreshToken: authentication.refreshToken ?? previous?.refreshToken,
        expiryDate: parseTimestamp(authentication.expiresAt) ?? previous?.expiryDate,
        refreshTokenExpiryDate: parseTimestamp(authentication.refreshTokenExpiresAt) ?? previous?.refreshTokenExpiryDate,
        grantedScopes: authentication.scopes ?? previous?.grantedScopes,
      }),
    );

    await this.tryStoreAuthDataInVault(accountName);
  }

  private async loadAccountAuth(accountName: string): Promise<void> {
    if (!this.vaultService) return;
    // A PAT account has nothing in the vault to load.
    if (this.accounts.get(accountName)?.token) return;
    // An account that has never been authenticated has no vault entry yet, which isn't an error.
    if (this.vaultService.getSecret(GITHUB_VAULT_CATEGORY, accountName) === undefined) return;

    try {
      const stored = this.vaultService.requireJsonItem(GITHUB_VAULT_CATEGORY, accountName, GitHubStoredTokenSchema);
      this.authData.set(accountName, stored);
    } catch (err) {
      this.app.serviceError(
        this,
        `Couldn't load the auth token for GitHub account ${accountName} from the vault. Re-authenticate with /github account auth ${accountName} to re-authorize.`,
        err,
      );
      return;
    }

    // The profile is a display convenience. A network hiccup while fetching it
    // says nothing about the token, so it must not send the user to re-authenticate.
    try {
      await this.syncAccountProfile(accountName);
    } catch (err) {
      this.app.serviceError(this, `Couldn't fetch the GitHub profile for account ${accountName}.`, err);
    }
  }

  private async tryStoreAuthDataInVault(accountName: string): Promise<void> {
    if (!this.vaultService) return;
    const authData = this.authData.get(accountName);
    await this.vaultService.setJsonItem(GITHUB_VAULT_CATEGORY, accountName, authData);
  }

  private async syncAccountProfile(accountName: string): Promise<void> {
    void this.requireAccount(accountName);
    const authData = this.authData.get(accountName);
    if (authData?.profile) return;

    const user = await this.getAuthenticatedUser(accountName);

    this.authData.set(accountName, {
      ...this.authData.get(accountName),
      profile: {
        login: user.login,
        id: user.id,
        name: user.name,
        email: user.email,
        company: user.company,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
      },
    });

    await this.tryStoreAuthDataInVault(accountName);
  }

  private rankDocumentationFiles(files: Array<{ path?: string | undefined; type?: string | undefined; size?: number | undefined }>): Array<{
    path: string;
    size: number;
  }> {
    return files
      .filter(file => file.type === "blob" && file.path !== undefined)
      .map(file => ({ path: file.path as string, size: file.size ?? 0 }))
      .filter(file => {
        const lower = file.path.toLowerCase();
        return (
          lower === "readme.md" ||
          lower === "readme.mdx" ||
          lower.startsWith("docs/") ||
          lower === "documentation.md" ||
          lower.endsWith("/readme.md") ||
          lower.endsWith("/readme.mdx") ||
          lower.endsWith(".md") ||
          lower.endsWith(".mdx")
        );
      })
      .map(file => ({ ...file, rank: this.documentationRank(file.path) }))
      .sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path))
      .map(file => ({ path: file.path, size: file.size }));
  }

  private documentationRank(path: string): number {
    const lower = path.toLowerCase();
    if (lower === "readme.md" || lower === "readme.mdx") return 0;
    if (lower === "docs/readme.md" || lower === "docs/readme.mdx") return 1;
    if (lower === "docs/index.md" || lower === "docs/index.mdx") return 2;
    if (lower.startsWith("docs/")) return 3;
    return 4;
  }

  private createRequestFailure(context: string, error: unknown): Error {
    const message = Error.isError(error) && error.message ? `${context} failed: ${error.message}` : `${context} failed`;
    return new Error(message, { cause: error });
  }

  private normalizeGitHubRequestError(accountName: string | undefined, request: GitHubRequestOptions, error: unknown): Error {
    if (!(error instanceof RequestError)) return Error.isError(error) ? error : this.createRequestFailure(request.context, error);

    const who = accountName ? `GitHub account "${accountName}"` : "the unauthenticated GitHub client";
    const authHint = accountName
      ? `Re-authenticate with /github account auth ${accountName}.`
      : "Connect an account with /connect github to raise the rate limit and reach private data.";

    let message = `${request.context} failed (${error.status}): ${error.message}`;

    if (error.status === 401) {
      message = `${request.context} failed (401): ${who} is not authenticated, or its token was revoked. ${authHint}`;
    } else if (this.isRateLimited(error)) {
      message = `${request.context} failed (${error.status}): ${who} hit the GitHub rate limit${this.describeRateLimitReset(error)}. ${authHint}`;
    } else if (error.status === 403) {
      const missingScopes = this.getMissingGrantedScopes(accountName, error, request.requiredScopes);
      const scopeMessage = missingScopes.length ? ` Missing scope${missingScopes.length === 1 ? "" : "s"}: ${missingScopes.join(", ")}.` : "";
      message = `${request.context} failed (403): ${who} is missing permission for this request.${scopeMessage} ${authHint}`;
    }

    // Per-call guidance for statuses whose generic text explains nothing, such as
    // a 422 on a self-approval or a 406 on an oversized diff.
    const hint = request.statusHints?.[error.status];
    if (hint) message += ` ${hint}`;

    return new Error(message, { cause: error });
  }

  private isRateLimited(error: RequestError): boolean {
    if (error.status === 429) return true;
    return error.status === 403 && error.response?.headers["x-ratelimit-remaining"] === "0";
  }

  private describeRateLimitReset(error: RequestError): string {
    const reset = Number(error.response?.headers["x-ratelimit-reset"]);
    if (!Number.isFinite(reset)) return "";
    return `, which resets at ${new Date(reset * 1000).toISOString()}`;
  }

  private getMissingGrantedScopes(accountName: string | undefined, error: RequestError, requiredScopes?: string[]): string[] {
    const grantedScopes = new Set(accountName ? (this.authData.get(accountName)?.grantedScopes ?? []) : []);
    if (grantedScopes.size === 0) return [];

    const acceptedHeader = error.response?.headers["x-accepted-oauth-scopes"];
    const acceptedScopes =
      typeof acceptedHeader === "string"
        ? acceptedHeader
            .split(",")
            .map(scope => scope.trim())
            .filter(Boolean)
        : [];
    const neededScopes = requiredScopes ?? acceptedScopes;

    // GitHub's accepted-scopes header lists alternatives — any one of them is enough.
    if (neededScopes.some(scope => grantedScopes.has(scope))) return [];
    return neededScopes;
  }
}

/**
 * Splits a unified diff on its `diff --git` boundaries and keeps the files whose
 * header mentions one of the requested paths. Returns an empty string when
 * nothing matches, which callers report rather than mistaking for an empty diff.
 */
function filterDiffByPaths(diff: string, paths: string[]): string {
  const sections = diff.split(/^(?=diff --git )/m).filter(Boolean);

  return sections
    .filter(section => {
      const header = section.slice(0, section.indexOf("\n"));
      return paths.some(path => header.includes(path));
    })
    .join("");
}

function normalizeCheckState(state: string): GitHubCheckState {
  return state === "success" || state === "failure" || state === "error" ? state : "pending";
}

/** Maps a check run's status/conclusion pair onto the commit-status vocabulary. */
function checkRunState(status: string, conclusion: string | null): GitHubCheckState {
  if (status !== "completed") return "pending";

  switch (conclusion) {
    // Neutral and skipped runs don't block a merge, so they count as passing.
    case "success":
    case "neutral":
    case "skipped":
      return "success";
    case "failure":
    case "timed_out":
    case "startup_failure":
      return "failure";
    case "cancelled":
    case "action_required":
    case "stale":
      return "error";
    default:
      return "pending";
  }
}

/** A rollup is as bad as its worst member, matching GitHub's own combined status. */
function rollupCheckState(checks: GitHubPRCheck[]): GitHubCheckState {
  if (checks.length === 0) return "pending";
  if (checks.some(check => check.state === "error")) return "error";
  if (checks.some(check => check.state === "failure")) return "failure";
  if (checks.some(check => check.state === "pending")) return "pending";
  return "success";
}

/** GitHub returns token expiry as an ISO string; the vault stores epoch millis. */
function parseTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
