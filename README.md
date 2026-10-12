# @tokenring-ai/github

GitHub account connection, repository search, content retrieval, and issue management for Token Ring, built on [Octokit](https://github.com/octokit/octokit.js).

## Overview

The `@tokenring-ai/github` package connects one or more GitHub accounts and exposes the GitHub REST API to agents and users:

- **GitHubService** — multi-account GitHub access through Octokit, with tokens stored in the credential vault
- **OAuth web flow** — `/connect github` signs in through the browser and captures the callback on the local web host
- **Personal access tokens** — an alternative to OAuth for accounts that don't have an OAuth app registered
- **Issues** — list, read, search, create, update, comment on, and label issues
- **Pull requests** — list, read, search, diff, review, comment on, open, update, and close pull requests
- **Twenty-six AI tools** covering repository search, documentation and file retrieval, issues, and pull requests
- **GitHub Enterprise support** via a per-account API base URL

## Installation

```bash
bun add @tokenring-ai/github
```

## Connecting an account

### OAuth (default)

Register a GitHub OAuth app, set its **Authorization callback URL** to
`http://127.0.0.1:<web host port>/oauth/github/callback`, then configure the client credentials:

```yaml
github:
  clientId: { source: env, env: GITHUB_CLIENT_ID }
  clientSecret: { source: env, env: GITHUB_CLIENT_SECRET }
```

Then run:

```text
/connect github octocat --name=work --scopes=repo,read:org
```

TokenRing prints an authorization URL, waits up to five minutes for GitHub to call back into the local
web host, exchanges the code for a token, and stores that token in the vault under the `github` category.
Nothing secret is written to the configuration file.

### Personal access token

If no OAuth app is configured, `/connect github` prompts for a personal access token instead. You can
also pass one directly:

```text
/connect github --token=ghp_xxx --name=ci
```

A token passed this way is written **literally** into the configuration overrides for the scope you
save to — by default `--save=workspace`, which is `<workspace>/.tokenring/config.yaml` inside the
project. Pass `--save=global` to keep it out of the repository, or skip the flag entirely and point
the account at a secret the plugin resolves at startup:

```yaml
github:
  accounts:
    ci:
      token: { source: env, env: GITHUB_TOKEN }
      # or: { source: vault, category: github, key: ci-pat }
```

Unlike a personal access token, an OAuth token obtained through `/connect github` is always stored in
the vault and never written to the configuration file.

## Dashboard

The plugin ships a **GitHub** dashboard for the web UI at `/github`, built from
four dock views (`frontend/`):

| View | What it does |
| --- | --- |
| `github-navigator` | Repository picker (the workspace's `origin` remote is pre-selected; recent repositories and GitHub search are a click away), account selector, and the issue or pull request list with open/closed/all and text filters. Agent sessions for the dashboard live at the bottom. |
| `github-item` | One issue or pull request per panel: description and comments rendered as Markdown, a comment composer, label editing, close/reopen, inline title/body/assignee edits. Pull requests add **Files** (per-file unified diffs), **Checks** (commit statuses and check runs), a review dialog (approve / request changes / comment), reviewer requests, and close. There is no merge button, for the same reason there is no merge tool. |
| `github-issue-create` | New-issue form with labels and assignees. |
| `github-accounts` | Account status, OAuth **Connect** (opens GitHub; the local callback completes the sign-in) and **Disconnect**. |

**Work with agent** on an item attaches (or creates) an agent of one of the
configured `agentTypes`, pre-fills its chat composer with a prompt naming the
item, and docks the chat beside the panel. The agent then reads the item with
the tools above.

URLs: `/github/:owner/:repo`, `/github/:owner/:repo/issues/:number`,
`/github/:owner/:repo/pulls/:number`, `/github/:owner/:repo/issues/new`,
`/github/accounts`.

## Chat Commands

| Command | Description |
|---------|-------------|
| `/connect github [login]` | Connect a GitHub account (alias: `/github connect`) |
| `/github account list` | List configured accounts and their authentication state |
| `/github account get <name>` | Show one account's login, scopes, and credential type |
| `/github account auth <name>` | Re-run the OAuth flow for a configured account |
| `/github account logout <name>` | Revoke the stored OAuth token and delete it from the vault |
| `/github search <query>` | Search GitHub repositories by keyword |
| `/github docs <owner>/<repo>` | Retrieve documentation files for a repository |
| `/github file <owner>/<repo> <path> [ref]` | Retrieve a specific file from a repository |
| `/github issues <owner>/<repo>` | List issues, with `--state`, `--labels`, `--assignee`, `--creator`, `--sort`, `--limit` |
| `/github issues search "<query>"` | Search issues and pull requests across GitHub |
| `/github issue <owner>/<repo> <number>` | Show issue details, with `--comments` for the thread |
| `/github issue create <owner>/<repo> <title>` | Create an issue, with `--body`, `--labels`, `--assignees`, `--milestone` |
| `/github issue comment <owner>/<repo> <number> <comment>` | Comment on an issue or pull request |
| `/github labels <owner>/<repo>` | List the repository's labels |
| `/github prs <owner>/<repo>` | List pull requests, with `--state`, `--base`, `--head`, `--labels`, `--sort`, `--limit` |
| `/github prs search "<query>"` | Search pull requests across GitHub |
| `/github pr <owner>/<repo> <number>` | Show pull request details, with `--reviews` and `--comments` |
| `/github pr diff <owner>/<repo> <number>` | Show the unified diff, with `--paths` and `--maxLength` |
| `/github pr files <owner>/<repo> <number>` | List changed files, with `--patch` for the hunks |
| `/github pr status <owner>/<repo> <number>` | Show CI status for the head commit |
| `/github pr review <owner>/<repo> <number> <verdict>` | Review: `approve`, `request-changes`, or `comment` |
| `/github pr comment <owner>/<repo> <number> <comment>` | Comment on the thread, or inline with `--path` and `--line` |
| `/github pr create <owner>/<repo> <title>` | Open a pull request, with `--head`, `--base`, `--body`, `--draft` |

Every command above accepts `--account=<name>` to pick which account to act as.

## Tools

| Tool | Display Name | Description | Writes |
|------|-------------|-------------|--------|
| `github_searchRepositories` | GitHub/searchRepositories | Search GitHub repositories by keyword | |
| `github_getRepoDocumentation` | GitHub/getRepoDocumentation | Retrieve key documentation files for a GitHub repository | |
| `github_getRepoFile` | GitHub/getRepoFile | Retrieve a file from a GitHub repository | |
| `github_listIssues` | GitHub/listIssues | List issues in a GitHub repository, with optional state, label, and assignee filters | |
| `github_getIssue` | GitHub/getIssue | Get a GitHub issue's details, optionally with its comment thread | |
| `github_searchIssues` | GitHub/searchIssues | Search issues and pull requests across GitHub using the search API. Supports qualifiers such as repo:owner/name, is:open, is:issue, label:bug, and author:username. | |
| `github_listLabels` | GitHub/listLabels | List the labels defined in a GitHub repository | |
| `github_createIssue` | GitHub/createIssue | Create a new issue in a GitHub repository | ✅ |
| `github_updateIssue` | GitHub/updateIssue | Update a GitHub issue's title, body, state, labels, assignees, or milestone | ✅ |
| `github_commentIssue` | GitHub/commentIssue | Add a comment to a GitHub issue or pull request | ✅ |
| `github_addLabels` | GitHub/addLabels | Add labels to a GitHub issue, keeping any labels already on it | ✅ |
| `github_removeLabel` | GitHub/removeLabel | Remove a single label from a GitHub issue | ✅ |
| `github_listPRs` | GitHub/listPRs | List pull requests in a GitHub repository, with optional state and branch filters | |
| `github_getPR` | GitHub/getPR | Get a pull request's details, optionally with its reviews and comments | |
| `github_searchPRs` | GitHub/searchPRs | Search pull requests across GitHub using the search API's query syntax | |
| `github_getPRDiff` | GitHub/getPRDiff | Get a pull request's unified diff, optionally narrowed to specific files | |
| `github_getPRFiles` | GitHub/getPRFiles | List the files a pull request changes, with per-file line counts and optional diff hunks | |
| `github_getPRStatus` | GitHub/getPRStatus | Get the CI status for a pull request's head commit, covering both commit statuses and Actions check runs | |
| `github_listPRReviews` | GitHub/listPRReviews | List the reviews submitted on a pull request, with their approval state | |
| `github_listPRComments` | GitHub/listPRComments | List a pull request's comments: the conversation thread, the inline review comments, or both | |
| `github_createPR` | GitHub/createPR | Open a new pull request in a GitHub repository | ✅ |
| `github_updatePR` | GitHub/updatePR | Update a pull request's title, body, state, base branch, labels, assignees, or reviewers | ✅ |
| `github_closePR` | GitHub/closePR | Close a pull request without merging it | ✅ |
| `github_reviewPR` | GitHub/reviewPR | Submit a review on a pull request: approve, request changes, or comment | ✅ |
| `github_commentPR` | GitHub/commentPR | Comment on a pull request, either on the conversation thread or inline on a specific file and line | ✅ |
| `github_addPRReviewers` | GitHub/addPRReviewers | Request a review on a pull request from users or teams | ✅ |

Each tool takes an optional `account` argument.

Tools marked **Writes** go through `ChatService.checkToolApproval` before touching GitHub, so they
respect the workspace's `autoToolApprovalLevel` and `toolApprovalMode`. Safety levels run from 4
(label changes, requesting a review), through 5 (creating an issue, commenting, updating or closing a
pull request), to 6 (updating an issue, opening a pull request, submitting a review — an approval can
satisfy a branch protection rule). Commands are not gated — running one is already an explicit
instruction from the user.

There is deliberately no merge tool or command. Merging writes to a repository's default branch and
is the one pull request operation nothing here can undo, so agents cannot do it. A person can merge
(or turn on auto-merge) from the GitHub dashboard's pull request panel, behind a confirmation that
names the method and branches; the merge is pinned to the head SHA the panel showed, so commits pushed
after the user looked are refused rather than merged unseen.

## Issues

`/github issues` and `github_listIssues` exclude pull requests by default. GitHub's issues endpoint
returns pull requests alongside issues; since neither GitHub's own issue list nor `gh issue list`
shows them, they're filtered out unless you pass `--includePullRequests`. Anything that comes back
carries an `isPullRequest` flag either way.

`/github issues search` is different: it uses GitHub's search API, which has its own rate limit and
query syntax, and it spans repositories. Results include pull requests unless the query says
`is:issue`. The query is passed through untouched, so all GitHub qualifiers work:

```text
/github issues search repo:vercel/ai is:open label:bug
/github issues search is:issue author:octocat streaming
```

Issue and comment bodies are truncated before display — 8,000 characters for an issue body, 2,000 for
each comment — so a long thread can't flood the context window.

## Pull requests

**Listed and searched pull requests are summaries.** GitHub's list and search endpoints don't return
diff stats, mergeability, commit counts, or comment counts — only `GET /pulls/{number}` does. Those
fields are therefore optional on `GitHubPullRequest` and left `undefined` rather than defaulted to
zero, so "not fetched" stays distinguishable from "zero". Call `getPullRequest` (or `/github pr`) to
fill them in.

**`--labels` on `/github prs` filters locally.** Unlike the issues endpoint, GitHub's pulls endpoint
takes no label filter, so the label match is applied to the page that came back. Raise `--limit` if a
labelled pull request seems to be missing.

**Diffs are capped.** `getPRDiff` truncates at 100,000 characters and `getPRFiles` truncates each
file's patch at 4,000. Use `--paths` to narrow a large diff before the cap applies; GitHub itself
answers `406` for diffs it refuses to generate, and the error says so and points at `getPRFiles`.

**CI status covers both APIs.** `getPRStatus` fetches legacy commit statuses *and* Actions check runs
against the head commit and merges them into one rollup. Checking only one reports an empty result
for repositories that use the other. The rollup is as bad as its worst check; `neutral` and `skipped`
check runs count as passing, since they don't block a merge. Check runs are paged through (up to 500)
rather than read one page at a time, so a failure past the first hundred still fails the rollup.

**Comments come from two streams.** A pull request's conversation thread is stored as issue comments,
while inline code comments live on the reviews API. `listPRComments` returns both by default,
interleaved by creation time, each tagged with `kind: "review" | "conversation"`. Passing a `path` to
`commentPullRequest` posts inline; omitting it posts on the thread.

**Search is constrained to pull requests.** `is:pr` is appended unless the query already says what it
wants, so `/github prs search repo:octo/repo is:open` does what it looks like it does.

Note that Octokit paces requests that trigger notifications — creating a pull request, commenting,
reviewing — about three seconds apart. A burst of writes will feel slow; that's deliberate throttling,
not a hang.

## Account selection

When a tool or command doesn't name an account, the service picks one in this order:

1. `github.defaultAccount`, if set
2. The only configured account, if there is exactly one
3. No account — requests go out unauthenticated, against GitHub's much lower anonymous rate limit

With several accounts configured and no default, the service raises an error rather than guessing.

## Configuration

```yaml
github:
  clientId: { source: env, env: GITHUB_CLIENT_ID }
  clientSecret: { source: env, env: GITHUB_CLIENT_SECRET }
  clientType: oauth-app        # or github-app
  userAgent: TokenRing
  defaultAccount: work
  accounts:
    work:
      login: octocat
      scopes: [repo, read:org, read:user]
    enterprise:
      baseUrl: https://github.example.com/api/v3
    ci:
      token: { source: vault, category: github, key: ci-pat }
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `clientId` | `sourcedValue` | no | `fromEnv("GITHUB_CLIENT_ID")` | GitHub OAuth app client ID |
| `clientSecret` | `secret` | no | `fromEnv("GITHUB_CLIENT_SECRET")` | GitHub OAuth app client secret |
| `clientType` | `"oauth-app" \| "github-app"` | no | `"oauth-app"` | Whether the credentials belong to an OAuth App or a GitHub App |
| `userAgent` | `string` | no | `"TokenRing"` | User-Agent sent with GitHub API requests |
| `accounts` | `Record<string, GitHubAccount>` | no | `{}` | Connected GitHub accounts, keyed by name |
| `accounts.<name>.login` | `string` | no | — | GitHub username, used to pre-fill the sign-in page |
| `accounts.<name>.baseUrl` | `string` | no | `"https://api.github.com"` | GitHub REST API base URL (change for GitHub Enterprise) |
| `accounts.<name>.scopes` | `string[]` | no | `["repo", "read:org", "read:user"]` | OAuth scopes requested when authenticating this account |
| `accounts.<name>.token` | `secret` | no | — | Personal access token, used instead of the OAuth sign-in flow |
| `defaultAccount` | `string` | no | — | Account used when a tool or command doesn't name one |
| `agentTypes` | `string[]` | no | `["code", "plan"]` | Agent types the dashboard's **Work with agent** offers |

OAuth app credentials (`clientId`, `clientSecret`) accept a literal string or a secret reference and
default to the `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` environment variables. `clientType`
controls whether tokens are refreshed automatically: GitHub App user tokens expire and are refreshed,
while OAuth App tokens do not expire.

### Schema Metadata

The following `.meta()` annotations on `GitHubConfigSchema` and `GitHubAccountSchema` drive config UI
integration:

| Field | Metadata |
|-------|----------|
| `github` (root) | `label: "GitHub"`, `description: "GitHub OAuth accounts, repository search, and content retrieval settings"` |
| `clientId` | `description: "GitHub OAuth app client ID"` |
| `clientSecret` | `description: "GitHub OAuth app client secret"` |
| `clientType` | `advanced: true`, `description: "Whether the credentials belong to an OAuth App or a GitHub App"` |
| `userAgent` | `advanced: true`, `description: "User-Agent sent with GitHub API requests"` |
| `accounts` | `label: "Accounts"`, `description: "Connected GitHub accounts, keyed by name"` |
| `accounts.<name>.login` | `description: "GitHub username, used to pre-fill the sign-in page"` |
| `accounts.<name>.baseUrl` | `advanced: true`, `description: "GitHub REST API base URL (change for GitHub Enterprise)"` |
| `accounts.<name>.scopes` | `description: "OAuth scopes requested when authenticating this account"` |
| `accounts.<name>.token` | `description: "Personal access token, used instead of the OAuth sign-in flow"` |
| `defaultAccount` | `description: "Account used when a tool or command doesn't name one"` |

## Developer Reference

### GitHubService

```typescript
class GitHubService implements TokenRingService {
  readonly name = "GitHubService";
  description = "Search GitHub repositories and retrieve repository documentation and files";

  constructor(app: TokenRingApp);
  reconfigure(options: ResolvedGitHubConfig): void;

  // Accounts
  getAvailableAccounts(): string[];
  requireAccount(name: string): ResolvedGitHubAccount;
  getAccountStatus(accountName: string): {
    isAuthenticated: boolean;
    usesPersonalAccessToken: boolean;
    grantedScopes?: string[];
    profile?: GitHubStoredToken["profile"];
    account: ResolvedGitHubAccount;
  };
  requireAuthorizedAccount(accountName: string): ReturnType<GitHubService["getAccountStatus"]>;
  resolveAccountName(accountName?: string): string | undefined;

  // OAuth
  hasOAuthClient(): boolean;
  createAuthorizationUrl(
    accountName: string,
    redirectUri: string,
    options?: { state?: string; scopes?: string[]; login?: string },
  ): string;
  beginAuthorization(
    accountName: string,
    redirectUri: string,
    options?: { timeoutMs?: number },
  ): { authorizationUrl: string; waitForCallback: Promise<string> };
  completePendingAuthorization(callbackUrl: string): void;
  exchangeAuthorizationCode(
    accountName: string,
    code: string,
    redirectUri: string,
  ): Promise<ReturnType<GitHubService["getAccountStatus"]>>;
  revokeAuthorization(accountName: string): Promise<void>;

  // API
  withOctokit<T>(
    accountName: string | undefined,
    request: { context: string; requiredScopes?: string[]; statusHints?: Record<number, string> },
    operation: (octokit: Octokit) => Promise<T>,
  ): Promise<T>;
  getAuthenticatedUser(accountName: string): Promise<Octokit["rest"]["users"]["getAuthenticated"]["response"]["data"]>;
  searchRepositories(
    query: string,
    options?: { account?: string; limit?: number; sort?: "stars" | "updated"; order?: "asc" | "desc" },
  ): Promise<GitHubRepoSearchResult[]>;
  getRepository(owner: string, repo: string, options?: { account?: string }): Promise<GitHubRepository>;
  getFile(owner: string, repo: string, path: string, ref?: string, options?: { account?: string }): Promise<GitHubFile>;
  getRepositoryDocumentation(
    owner: string,
    repo: string,
    options?: { account?: string; ref?: string; maxFiles?: number },
  ): Promise<{ repository: string; branch: string; files: Array<{ path: string; size: number; content: string }> }>;

  // Issues
  listIssues(owner: string, repo: string, options?: GitHubIssueListOptions): Promise<GitHubIssue[]>;
  getIssue(owner: string, repo: string, issueNumber: number, options?: { account?: string }): Promise<GitHubIssue>;
  createIssue(owner: string, repo: string, options: GitHubIssueCreateOptions): Promise<GitHubIssue>;
  updateIssue(owner: string, repo: string, issueNumber: number, options: GitHubIssueUpdateOptions): Promise<GitHubIssue>;
  addIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string,
    options?: { account?: string },
  ): Promise<GitHubIssueComment>;
  listIssueComments(
    owner: string,
    repo: string,
    issueNumber: number,
    options?: { account?: string; perPage?: number; page?: number },
  ): Promise<GitHubIssueComment[]>;
  searchIssues(query: string, options?: GitHubIssueSearchOptions): Promise<GitHubIssue[]>;
  listLabels(
    owner: string,
    repo: string,
    options?: { account?: string; perPage?: number; page?: number },
  ): Promise<GitHubLabel[]>;
  addLabels(
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[],
    options?: { account?: string },
  ): Promise<GitHubLabel[]>;
  removeLabel(
    owner: string,
    repo: string,
    issueNumber: number,
    label: string,
    options?: { account?: string },
  ): Promise<GitHubLabel[]>;

  // Pull requests
  listPullRequests(owner: string, repo: string, options?: GitHubPRListOptions): Promise<GitHubPullRequest[]>;
  getPullRequest(owner: string, repo: string, prNumber: number, options?: { account?: string }): Promise<GitHubPullRequest>;
  createPullRequest(owner: string, repo: string, options: GitHubPRCreateOptions): Promise<GitHubPullRequest>;
  updatePullRequest(owner: string, repo: string, prNumber: number, options: GitHubPRUpdateOptions): Promise<GitHubPullRequest>;
  closePullRequest(owner: string, repo: string, prNumber: number, options?: { account?: string }): Promise<GitHubPullRequest>;
  reviewPullRequest(owner: string, repo: string, prNumber: number, options: GitHubPRReviewOptions): Promise<GitHubPRReview>;
  commentPullRequest(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    options?: GitHubPRCommentOptions,
  ): Promise<GitHubPRComment>;
  listPRComments(
    owner: string,
    repo: string,
    prNumber: number,
    options?: GitHubPRCommentListOptions,
  ): Promise<GitHubPRComment[]>;
  listPRReviews(
    owner: string,
    repo: string,
    prNumber: number,
    options?: { account?: string; perPage?: number; page?: number },
  ): Promise<GitHubPRReview[]>;
  getPRDiff(
    owner: string,
    repo: string,
    prNumber: number,
    options?: { account?: string; paths?: string[]; maxLength?: number },
  ): Promise<string>;
  getPRFiles(
    owner: string,
    repo: string,
    prNumber: number,
    options?: { account?: string; perPage?: number; page?: number },
  ): Promise<GitHubPRFileChange[]>;
  getPRStatus(owner: string, repo: string, prNumber: number, options?: { account?: string }): Promise<GitHubPRStatus>;
  searchPullRequests(query: string, options?: GitHubPRSearchOptions): Promise<GitHubPullRequest[]>;
  addPRReviewers(
    owner: string,
    repo: string,
    prNumber: number,
    reviewers: string[],
    teamReviewers?: string[],
    options?: { account?: string },
  ): Promise<GitHubPullRequest>;
  listRequestedReviewers(
    owner: string,
    repo: string,
    prNumber: number,
    options?: { account?: string },
  ): Promise<{ users: GitHubUser[]; teams: GitHubTeam[] }>;
}
```

`mergePullRequest`, `setPullRequestAutoMerge` (GraphQL, since REST has no auto-merge endpoint) and
`listBranches` exist for the dashboard only; no tool or command calls them (see [Tools](#tools)).

### RPC endpoint

`rpc/schema.ts` and `rpc/github.ts` expose the service to the web UI at
`/rpc/github`, registered with `RpcService` in `plugin.ts`. Every method
delegates to `GitHubService` and returns the structured issue and pull request
objects (the tools format the same objects as Markdown). Writes carry no
tool-approval gate: they are actions the user takes directly in the UI.

- Status and sign-in: `getStatus` (accounts without their tokens, `hasOAuthClient`, `agentTypes`), `beginAuthorization`, `revokeAuthorization`.
- Repositories: `getWorkspaceRepository` (parses the workspace's `origin` remote, see `workspaceRepository.ts`), `searchRepositories`, `getRepository`, `listBranches` (head/base pickers of the new pull request form).
- Issues: `listIssues`, `getIssue` (with comments), `searchIssues`, `listLabels`, `createIssue`, `updateIssue`, `addIssueComment`, `addLabels`, `removeLabel`.
- Pull requests: `listPullRequests`, `getPullRequest` (with reviews and both comment streams), `searchPullRequests`, `getPRFiles`, `getPRStatus`, `createPullRequest`, `updatePullRequest`, `closePullRequest`, `mergePullRequest` (`merge`/`squash`/`rebase`, optional commit title/message, and the expected head `sha`), `setAutoMerge` (enable with a method, or disable), `reviewPullRequest`, `commentPullRequest`, `addPRReviewers`.

The transport validates every result against the zod schemas in
`rpc/wire.ts`, which mirror the TypeScript domain types below;
`wireSchemasMatchDomainTypes` fails to compile if the two drift. The generated
JSON Schema lives in the monorepo at `schema/rpc/github.json`
(`bun run schema:rpc`).

### Issue types

`types.ts` defines `GitHubIssue`, `GitHubIssueComment`, `GitHubLabel`, `GitHubMilestone`,
`GitHubReactions`, and `GitHubUser`, along with normalizers (`toGitHubIssue`, `toGitHubLabel`, …)
that flatten Octokit's response shapes onto them. Octokit types issue fields loosely — `labels` is a
`string | object` union, `state` is a bare `string`, and users are nullable — so the mapping happens
once in those normalizers rather than at every call site. `GitHubReactions` renames GitHub's `+1` and
`-1` keys to `plus_one` and `minus_one` so they're addressable as identifiers.

`updateIssue` distinguishes an absent field from `null`: omitting `milestone` leaves it alone, while
passing `null` clears it. Note that `body`, `labels`, and `assignees` replace their existing values
rather than merging — that's GitHub's behaviour, and `github_updateIssue` says so in its approval
prompt.

### Pull request types

`pullRequestTypes.ts` defines `GitHubPullRequest`, `GitHubPRRef`, `GitHubPRFileChange`,
`GitHubPRReview`, `GitHubPRComment`, `GitHubPRStatus`, `GitHubPRCheck`, `GitHubTeam`, and
`GitHubAutoMerge`, plus the normalizers that map Octokit's responses onto them. It imports the shared
`GitHubUser`, `GitHubLabel`, `GitHubMilestone`, and `GitHubReactions` primitives from `types.ts`.

Two shapes are worth knowing about:

- The eleven detail-only fields (`additions`, `deletions`, `changed_files`, `commits`, `comments`,
  `review_comments`, `merged`, `mergeable`, `mergeable_state`, `rebaseable`, `merged_by`) are
  optional, because only `GET /pulls/{number}` returns them. `mergeable: null` means GitHub is still
  computing mergeability, which is distinct from `undefined` meaning "never fetched".
- `GitHubPRComment.kind` tags whether a comment came from the reviews API or the conversation thread.

`updatePullRequest` fans out across three endpoints — `pulls.update` for title, body, state, and
base; `issues.update` for labels, assignees, and milestone; `pulls.requestReviewers` for reviewers —
then re-reads the pull request so the caller gets one consistent result. As with issues, `body`,
`labels`, and `assignees` replace rather than merge, and `github_updatePR` says so in its approval
prompt.

`withOctokit` is the extension point for GitHub endpoints this package doesn't wrap yet — it hands you a
configured, authenticated `Octokit` instance and converts failures into readable errors:

```typescript
const issues = await gitHubService.withOctokit("work", { context: "list issues for octo/repo" }, async octokit => {
  const { data } = await octokit.rest.issues.listForRepo({ owner: "octo", repo: "repo" });
  return data;
});
```

### Error handling

Octokit `RequestError`s are rewritten with the account name and a next step:

- **401** — the account isn't authenticated or its token was revoked; suggests `/github account auth <name>`
- **403 / 429 with an exhausted rate limit** — reports when the limit resets, and suggests connecting an account when the request was anonymous
- **403 otherwise** — lists the scopes GitHub accepted for the endpoint that the account wasn't granted

Calls can also attach `statusHints` to `withOctokit`, mapping a status code to guidance the generic
message can't give — a `422` on a self-approval, a `406` on an oversized diff, a `422` from opening a
pull request whose head doesn't exist.

### Documentation file ranking

`getRepositoryDocumentation` walks the repository tree and ranks candidates:

1. `README.md` / `README.mdx`
2. `docs/README.md` / `docs/README.mdx`
3. `docs/index.md` / `docs/index.mdx`
4. Other files under `docs/`
5. Any other `.md` / `.mdx` file

Files are fetched with `Promise.allSettled`, so one unreadable file doesn't sink the batch.

## Testing

```bash
bun test
```

`test/GitHubService.test.ts` covers authorization URL construction, callback matching, account selection,
the token exchange end to end against a mocked `fetch`, and error normalization.

`test/GitHubIssues.test.ts` covers issue normalization (string labels, `+1`/`-1` reactions, missing
authors, pull-request detection), the request parameters each service method sends, body truncation,
and that write tools refuse to call GitHub when approval is denied.

`test/GitHubPullRequests.test.ts` covers pull request normalization (summary versus detail shapes,
search results, deleted head repositories), local label filtering, the `is:pr` qualifier, diff media
type and truncation, the combined status/check-run rollup, review body validation, which endpoint
each kind of comment goes to, how an update fans out, and approval gating on the write tools.

That file takes around twenty seconds: Octokit paces notification-triggering writes about three
seconds apart, and several tests exercise them.

`test/GitHubRpc.test.ts` runs the RPC methods against the same mocked `fetch` and parses every
response with the wire schemas, so a domain type and its zod mirror cannot drift unnoticed.
`test/workspaceRepository.test.ts` covers remote URL parsing. The three GitHub test files share
`test/mockGitHub.ts`.

`frontend/views/github.test.tsx` and `frontend/components/PatchView.test.tsx` exercise the
dashboard views with a mocked RPC layer (`bunfig.toml` preloads the frontend's jsdom setup).

## Dependencies

| Package | Purpose |
|---------|---------|
| `@tokenring-ai/agent` | Agent integration and service management |
| `@tokenring-ai/app` | Plugin architecture and configuration |
| `@tokenring-ai/chat` | Tool registration and approval gating |
| `@tokenring-ai/secrets` | Secret references for the OAuth client and personal access tokens |
| `@tokenring-ai/utility` | `stripUndefinedKeys`, `KeyedRegistry`, `intelligentTruncate`, `markdownTable` |
| `@tokenring-ai/vault` | Encrypted storage for OAuth tokens |
| `@tokenring-ai/web-host` | Serves the OAuth callback URL |
| `octokit` | The GitHub SDK |
| `zod` | Configuration schema validation |

## License

MIT License — see LICENSE file for details.
