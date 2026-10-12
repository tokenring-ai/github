import type TokenRingApp from "@tokenring-ai/app";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import WebHostService from "@tokenring-ai/web-host/WebHostService";
import { extractAuthorizationCode } from "../authorizeAccount.ts";
import GitHubService, { GITHUB_OAUTH_CALLBACK_PATH } from "../GitHubService.ts";
import { readWorkspaceRepository } from "../workspaceRepository.ts";
import GitHubRpcSchema from "./schema.ts";

/** How long a sign-in started from the dashboard waits for GitHub to call back. */
const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The dashboard's view of GitHub. Every method delegates to `GitHubService`
 * and returns the structured objects the chat tools format as markdown.
 *
 * Writes carry no tool-approval gate: unlike a tool call an agent makes, these
 * are actions the user takes directly in the UI.
 */
export default createRPCEndpoint(GitHubRpcSchema, {
  getStatus(_args, app: TokenRingApp) {
    const github = app.requireService(GitHubService);
    const accounts = github.getAvailableAccounts().map(name => {
      const { isAuthenticated, usesPersonalAccessToken, grantedScopes, profile, account } = github.getAccountStatus(name);
      return {
        name,
        ...(account.login !== undefined ? { login: account.login } : {}),
        baseUrl: account.baseUrl,
        scopes: account.scopes,
        isAuthenticated,
        usesPersonalAccessToken,
        ...(grantedScopes !== undefined ? { grantedScopes } : {}),
        ...(profile !== undefined ? { profile } : {}),
      };
    });
    const defaultAccount = github.getDefaultAccountName();

    return {
      hasOAuthClient: github.hasOAuthClient(),
      ...(defaultAccount !== undefined ? { defaultAccount } : {}),
      agentTypes: github.getAgentTypes(),
      accounts,
    };
  },

  beginAuthorization(args, app: TokenRingApp) {
    const github = app.requireService(GitHubService);
    const webHost = app.requireService(WebHostService);

    const redirectUri = new URL(GITHUB_OAUTH_CALLBACK_PATH, `http://127.0.0.1:${webHost.getURL().port}`).toString();
    const { authorizationUrl, waitForCallback } = github.beginAuthorization(args.account, redirectUri, { timeoutMs: AUTHORIZATION_TIMEOUT_MS });

    // The browser completes the flow on its own; the token exchange runs here
    // once GitHub calls back, and the dashboard sees it through `getStatus`.
    void waitForCallback
      .then(callbackUrl => github.exchangeAuthorizationCode(args.account, extractAuthorizationCode(callbackUrl), redirectUri))
      .catch((error: unknown) => app.serviceError(github, `GitHub sign-in for ${args.account} did not complete:`, error));

    return { authorizationUrl, redirectUri };
  },

  async revokeAuthorization(args, app: TokenRingApp) {
    await app.requireService(GitHubService).revokeAuthorization(args.account);
    return { status: "success" as const };
  },

  async getWorkspaceRepository(_args, app: TokenRingApp) {
    // The launch directory is the checkout the user is working in; the workspace
    // directory (~/.tokenring/workspaces by default) rarely is, so it is a fallback.
    const { workingDirectory, workspaceDirectory } = app.appConfig;
    const repository =
      (await readWorkspaceRepository(workingDirectory)) ?? (workspaceDirectory !== workingDirectory ? await readWorkspaceRepository(workspaceDirectory) : null);
    return { repository };
  },

  async searchRepositories(args, app: TokenRingApp) {
    const repositories = await app
      .requireService(GitHubService)
      .searchRepositories(args.query, stripUndefinedKeys({ account: args.account, limit: args.limit }));
    return { repositories };
  },

  async getRepository(args, app: TokenRingApp) {
    const repository = await app.requireService(GitHubService).getRepository(args.owner, args.repo, stripUndefinedKeys({ account: args.account }));
    return { repository };
  },

  async listBranches(args, app: TokenRingApp) {
    const { owner, repo, ...options } = args;
    const branches = await app.requireService(GitHubService).listBranches(owner, repo, stripUndefinedKeys(options));
    return { branches };
  },

  async listIssues(args, app: TokenRingApp) {
    const { owner, repo, ...options } = args;
    const issues = await app.requireService(GitHubService).listIssues(owner, repo, stripUndefinedKeys(options));
    return { issues };
  },

  async getIssue(args, app: TokenRingApp) {
    const github = app.requireService(GitHubService);
    const account = stripUndefinedKeys({ account: args.account });
    const [issue, comments] = await Promise.all([
      github.getIssue(args.owner, args.repo, args.issueNumber, account),
      github.listIssueComments(args.owner, args.repo, args.issueNumber, { ...account, perPage: args.commentLimit ?? 100 }),
    ]);
    return { issue, comments };
  },

  async searchIssues(args, app: TokenRingApp) {
    const { query, ...options } = args;
    const issues = await app.requireService(GitHubService).searchIssues(query, stripUndefinedKeys(options));
    return { issues };
  },

  async listLabels(args, app: TokenRingApp) {
    const labels = await app.requireService(GitHubService).listLabels(args.owner, args.repo, stripUndefinedKeys({ account: args.account }));
    return { labels };
  },

  async createIssue(args, app: TokenRingApp) {
    const { owner, repo, ...options } = args;
    const issue = await app.requireService(GitHubService).createIssue(owner, repo, stripUndefinedKeys(options));
    return { issue };
  },

  async updateIssue(args, app: TokenRingApp) {
    const { owner, repo, issueNumber, ...options } = args;
    const issue = await app.requireService(GitHubService).updateIssue(owner, repo, issueNumber, stripUndefinedKeys(options));
    return { issue };
  },

  async addIssueComment(args, app: TokenRingApp) {
    const comment = await app
      .requireService(GitHubService)
      .addIssueComment(args.owner, args.repo, args.issueNumber, args.body, stripUndefinedKeys({ account: args.account }));
    return { comment };
  },

  async addLabels(args, app: TokenRingApp) {
    const labels = await app
      .requireService(GitHubService)
      .addLabels(args.owner, args.repo, args.issueNumber, args.labels, stripUndefinedKeys({ account: args.account }));
    return { labels };
  },

  async removeLabel(args, app: TokenRingApp) {
    const labels = await app
      .requireService(GitHubService)
      .removeLabel(args.owner, args.repo, args.issueNumber, args.label, stripUndefinedKeys({ account: args.account }));
    return { labels };
  },

  async listPullRequests(args, app: TokenRingApp) {
    const { owner, repo, ...options } = args;
    const pullRequests = await app.requireService(GitHubService).listPullRequests(owner, repo, stripUndefinedKeys(options));
    return { pullRequests };
  },

  async getPullRequest(args, app: TokenRingApp) {
    const github = app.requireService(GitHubService);
    const account = stripUndefinedKeys({ account: args.account });
    const [pullRequest, reviews, comments] = await Promise.all([
      github.getPullRequest(args.owner, args.repo, args.prNumber, account),
      github.listPRReviews(args.owner, args.repo, args.prNumber, { ...account, perPage: 100 }),
      github.listPRComments(args.owner, args.repo, args.prNumber, { ...account, include: "all", perPage: 100 }),
    ]);
    return { pullRequest, reviews, comments };
  },

  async searchPullRequests(args, app: TokenRingApp) {
    const { query, ...options } = args;
    const pullRequests = await app.requireService(GitHubService).searchPullRequests(query, stripUndefinedKeys(options));
    return { pullRequests };
  },

  async getPRFiles(args, app: TokenRingApp) {
    const { owner, repo, prNumber, ...options } = args;
    const files = await app.requireService(GitHubService).getPRFiles(owner, repo, prNumber, stripUndefinedKeys(options));
    return { files };
  },

  async getPRStatus(args, app: TokenRingApp) {
    const status = await app.requireService(GitHubService).getPRStatus(args.owner, args.repo, args.prNumber, stripUndefinedKeys({ account: args.account }));
    return { status };
  },

  async createPullRequest(args, app: TokenRingApp) {
    const { owner, repo, ...options } = args;
    const pullRequest = await app.requireService(GitHubService).createPullRequest(owner, repo, stripUndefinedKeys(options));
    return { pullRequest };
  },

  async mergePullRequest(args, app: TokenRingApp) {
    const { owner, repo, prNumber, ...options } = args;
    const result = await app.requireService(GitHubService).mergePullRequest(owner, repo, prNumber, stripUndefinedKeys(options));
    return { result };
  },

  async setAutoMerge(args, app: TokenRingApp) {
    const { owner, repo, prNumber, enabled, ...options } = args;
    const pullRequest = await app.requireService(GitHubService).setPullRequestAutoMerge(owner, repo, prNumber, enabled, stripUndefinedKeys(options));
    return { pullRequest };
  },

  async updatePullRequest(args, app: TokenRingApp) {
    const { owner, repo, prNumber, ...options } = args;
    const pullRequest = await app.requireService(GitHubService).updatePullRequest(owner, repo, prNumber, stripUndefinedKeys(options));
    return { pullRequest };
  },

  async closePullRequest(args, app: TokenRingApp) {
    const pullRequest = await app
      .requireService(GitHubService)
      .closePullRequest(args.owner, args.repo, args.prNumber, stripUndefinedKeys({ account: args.account }));
    return { pullRequest };
  },

  async reviewPullRequest(args, app: TokenRingApp) {
    const { owner, repo, prNumber, ...options } = args;
    const review = await app.requireService(GitHubService).reviewPullRequest(owner, repo, prNumber, stripUndefinedKeys(options));
    return { review };
  },

  async commentPullRequest(args, app: TokenRingApp) {
    const { owner, repo, prNumber, body, ...options } = args;
    const comment = await app.requireService(GitHubService).commentPullRequest(owner, repo, prNumber, body, stripUndefinedKeys(options));
    return { comment };
  },

  async addPRReviewers(args, app: TokenRingApp) {
    const pullRequest = await app
      .requireService(GitHubService)
      .addPRReviewers(args.owner, args.repo, args.prNumber, args.reviewers ?? [], args.teamReviewers, stripUndefinedKeys({ account: args.account }));
    return { pullRequest };
  },
});
