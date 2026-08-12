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

## Dependencies

- `@tokenring-ai/agent` — agent integration and service management
- `@tokenring-ai/app` — plugin architecture and configuration
- `@tokenring-ai/chat` — tool registration
- `@tokenring-ai/secrets` — secret references for the OAuth client and personal access tokens
- `@tokenring-ai/vault` — encrypted storage for OAuth tokens
- `@tokenring-ai/web-host` — serves the OAuth callback URL
- `octokit` — the GitHub SDK
- `zod` — configuration schema validation

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

```
/connect github octocat --name=work --scopes=repo,read:org
```

TokenRing prints an authorization URL, waits up to five minutes for GitHub to call back into the local
web host, exchanges the code for a token, and stores that token in the vault under the `github` category.
Nothing secret is written to the configuration file.

### Personal access token

If no OAuth app is configured, `/connect github` prompts for a personal access token instead. You can
also pass one directly:

```
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

| Tool | Description | Writes |
|------|-------------|--------|
| `github_searchRepositories` | Search GitHub repositories by keyword | |
| `github_getRepoDocumentation` | Retrieve key documentation files for a repository | |
| `github_getRepoFile` | Retrieve a specific file from a repository | |
| `github_listIssues` | List issues, with state, label, assignee, and date filters | |
| `github_getIssue` | Get an issue's details, optionally with its comment thread | |
| `github_searchIssues` | Search issues and pull requests across GitHub | |
| `github_listLabels` | List a repository's labels | |
| `github_createIssue` | Open a new issue | ✅ |
| `github_updateIssue` | Change title, body, state, labels, assignees, or milestone | ✅ |
| `github_commentIssue` | Comment on an issue or pull request | ✅ |
| `github_addLabels` | Add labels to an issue | ✅ |
| `github_removeLabel` | Remove a label from an issue | ✅ |
| `github_listPRs` | List pull requests, with state and branch filters | |
| `github_getPR` | Get a pull request's details, optionally with reviews and comments | |
| `github_searchPRs` | Search pull requests across GitHub | |
| `github_getPRDiff` | Get the unified diff, optionally narrowed to specific files | |
| `github_getPRFiles` | List changed files, with per-file line counts and optional hunks | |
| `github_getPRStatus` | Get CI status: commit statuses and Actions check runs together | |
| `github_listPRReviews` | List submitted reviews and their approval state | |
| `github_listPRComments` | List the conversation thread, the inline review comments, or both | |
| `github_createPR` | Open a new pull request | ✅ |
| `github_updatePR` | Change title, body, state, base, labels, assignees, or reviewers | ✅ |
| `github_closePR` | Close a pull request without merging | ✅ |
| `github_reviewPR` | Approve, request changes, or comment as a review | ✅ |
| `github_commentPR` | Comment on the thread, or inline on a file and line | ✅ |
| `github_addPRReviewers` | Request a review from users or teams | ✅ |

Each tool takes an optional `account` argument.

Tools marked **Writes** go through `ChatService.checkToolApproval` before touching GitHub, so they
respect the workspace's `autoToolApprovalLevel` and `toolApprovalMode`. Safety levels run from 4
(label changes, requesting a review) through 5 (creating, updating, commenting) to 6 (opening a pull
request, submitting a review — an approval can satisfy a branch protection rule). Commands are not
gated — running one is already an explicit instruction from the user.

There is deliberately no merge tool or command. Merging writes to a repository's default branch and
is the one pull request operation nothing here can undo, so it stays with the GitHub UI or `gh`.

## Issues

`/github issues` and `github_listIssues` exclude pull requests by default. GitHub's issues endpoint
returns pull requests alongside issues; since neither GitHub's own issue list nor `gh issue list`
shows them, they're filtered out unless you pass `--includePullRequests`. Anything that comes back
carries an `isPullRequest` flag either way.

`/github issues search` is different: it uses GitHub's search API, which has its own rate limit and
query syntax, and it spans repositories. Results include pull requests unless the query says
`is:issue`. The query is passed through untouched, so all GitHub qualifiers work:

```
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

| Field | Description |
|-------|-------------|
| `clientId` / `clientSecret` | OAuth app credentials, as a literal or a secret reference. Default to the `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` environment variables. |
| `clientType` | `oauth-app` (default) or `github-app`. GitHub App user tokens expire and are refreshed automatically. |
| `userAgent` | User-Agent sent with API requests |
| `accounts.<name>.login` | GitHub username, used to pre-fill the sign-in page |
| `accounts.<name>.baseUrl` | REST API base URL; change for GitHub Enterprise |
| `accounts.<name>.scopes` | OAuth scopes to request (default `repo`, `read:org`, `read:user`) |
| `accounts.<name>.token` | Personal access token, used instead of the OAuth flow |
| `defaultAccount` | Account used when a tool or command doesn't name one |

## Developer Reference

### GitHubService

```typescript
class GitHubService implements TokenRingService {
  constructor(app: TokenRingApp);
  reconfigure(options: ResolvedGitHubConfig): void;

  // Accounts
  getAvailableAccounts(): string[];
  requireAccount(name: string): ResolvedGitHubAccount;
  getAccountStatus(name: string): { isAuthenticated: boolean; usesPersonalAccessToken: boolean; grantedScopes?: string[]; profile?: ...; account: ... };
  requireAuthorizedAccount(name: string): ...;
  resolveAccountName(name?: string): string | undefined;

  // OAuth
  hasOAuthClient(): boolean;
  createAuthorizationUrl(name: string, redirectUri: string, options?: { state?: string; scopes?: string[]; login?: string }): string;
  beginAuthorization(name: string, redirectUri: string, options?: { timeoutMs?: number }): { authorizationUrl: string; waitForCallback: Promise<string> };
  completePendingAuthorization(callbackUrl: string): void;   // throws on every failure, and rejects the waiting sign-in
  exchangeAuthorizationCode(name: string, code: string, redirectUri: string): Promise<...>;
  revokeAuthorization(name: string): Promise<void>;

  // API
  withOctokit<T>(account: string | undefined, request: { context: string; requiredScopes?: string[] }, operation: (octokit: Octokit) => Promise<T>): Promise<T>;
  getAuthenticatedUser(name: string): Promise<...>;
  searchRepositories(query: string, options?: { account?: string; limit?: number; sort?: "stars" | "updated"; order?: "asc" | "desc" }): Promise<GitHubRepoSearchResult[]>;
  getRepository(owner: string, repo: string, options?: { account?: string }): Promise<GitHubRepository>;
  getFile(owner: string, repo: string, path: string, ref?: string, options?: { account?: string }): Promise<GitHubFile>;
  getRepositoryDocumentation(owner: string, repo: string, options?: { account?: string; ref?: string; maxFiles?: number }): Promise<...>;

  // Issues
  listIssues(owner: string, repo: string, options?: GitHubIssueListOptions): Promise<GitHubIssue[]>;
  getIssue(owner: string, repo: string, issueNumber: number, options?: { account?: string }): Promise<GitHubIssue>;
  createIssue(owner: string, repo: string, options: GitHubIssueCreateOptions): Promise<GitHubIssue>;
  updateIssue(owner: string, repo: string, issueNumber: number, options: GitHubIssueUpdateOptions): Promise<GitHubIssue>;
  addIssueComment(owner: string, repo: string, issueNumber: number, body: string, options?: { account?: string }): Promise<GitHubIssueComment>;
  listIssueComments(owner: string, repo: string, issueNumber: number, options?: { account?: string; perPage?: number; page?: number }): Promise<GitHubIssueComment[]>;
  searchIssues(query: string, options?: GitHubIssueSearchOptions): Promise<GitHubIssue[]>;
  listLabels(owner: string, repo: string, options?: { account?: string; perPage?: number; page?: number }): Promise<GitHubLabel[]>;
  addLabels(owner: string, repo: string, issueNumber: number, labels: string[], options?: { account?: string }): Promise<GitHubLabel[]>;
  removeLabel(owner: string, repo: string, issueNumber: number, label: string, options?: { account?: string }): Promise<GitHubLabel[]>;

  // Pull requests
  listPullRequests(owner: string, repo: string, options?: GitHubPRListOptions): Promise<GitHubPullRequest[]>;
  getPullRequest(owner: string, repo: string, prNumber: number, options?: { account?: string }): Promise<GitHubPullRequest>;
  createPullRequest(owner: string, repo: string, options: GitHubPRCreateOptions): Promise<GitHubPullRequest>;
  updatePullRequest(owner: string, repo: string, prNumber: number, options: GitHubPRUpdateOptions): Promise<GitHubPullRequest>;
  closePullRequest(owner: string, repo: string, prNumber: number, options?: { account?: string }): Promise<GitHubPullRequest>;
  reviewPullRequest(owner: string, repo: string, prNumber: number, options: GitHubPRReviewOptions): Promise<GitHubPRReview>;
  commentPullRequest(owner: string, repo: string, prNumber: number, body: string, options?: GitHubPRCommentOptions): Promise<GitHubPRComment>;
  listPRComments(owner: string, repo: string, prNumber: number, options?: GitHubPRCommentListOptions): Promise<GitHubPRComment[]>;
  listPRReviews(owner: string, repo: string, prNumber: number, options?: { account?: string; perPage?: number; page?: number }): Promise<GitHubPRReview[]>;
  getPRDiff(owner: string, repo: string, prNumber: number, options?: { account?: string; paths?: string[]; maxLength?: number }): Promise<string>;
  getPRFiles(owner: string, repo: string, prNumber: number, options?: { account?: string; perPage?: number; page?: number }): Promise<GitHubPRFileChange[]>;
  getPRStatus(owner: string, repo: string, prNumber: number, options?: { account?: string }): Promise<GitHubPRStatus>;
  searchPullRequests(query: string, options?: GitHubPRSearchOptions): Promise<GitHubPullRequest[]>;
  addPRReviewers(owner: string, repo: string, prNumber: number, reviewers: string[], teamReviewers?: string[], options?: { account?: string }): Promise<GitHubPullRequest>;
  listRequestedReviewers(owner: string, repo: string, prNumber: number, options?: { account?: string }): Promise<{ users: GitHubUser[]; teams: GitHubTeam[] }>;
}
```

There is no `mergePullRequest`; see the note under [Tools](#tools).

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

## License

MIT License - see LICENSE file for details.
