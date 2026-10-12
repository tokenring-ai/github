import { afterEach, describe, expect, it } from "bun:test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import type { z } from "zod";
import GitHubService from "../GitHubService.ts";
import githubRPC from "../rpc/github.ts";
import GitHubRpcSchema from "../rpc/schema.ts";
import { wireSchemasMatchDomainTypes } from "../rpc/wire.ts";
import type { ResolvedGitHubConfig } from "../schema.ts";
import { mockGitHub } from "./mockGitHub.ts";

const BASE_CONFIG: ResolvedGitHubConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  clientType: "oauth-app",
  userAgent: "TokenRing",
  agentTypes: ["code"],
  defaultAccount: "work",
  accounts: {
    work: { login: "octocat", baseUrl: "https://api.github.com", scopes: ["repo"], token: "ghp_pat" },
    personal: { baseUrl: "https://api.github.com", scopes: ["repo"] },
  },
};

const user = { login: "octocat", id: 1, avatar_url: "https://a", html_url: "https://h", type: "User" };

function rawIssue(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: "Something is broken",
    state: "open",
    locked: false,
    body: "It breaks.",
    labels: [{ id: 10, name: "bug", color: "d73a4a", description: "Not working" }],
    assignees: [user],
    milestone: null,
    comments: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    closed_at: null,
    html_url: "https://github.com/octo/repo/issues/1",
    user,
    ...overrides,
  };
}

function rawPull(overrides: Record<string, unknown> = {}) {
  return {
    number: 7,
    title: "Add feature",
    state: "open",
    draft: false,
    locked: false,
    body: "Adds it.",
    labels: [],
    assignees: [],
    requested_reviewers: [user],
    requested_teams: [],
    user,
    milestone: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    closed_at: null,
    merged_at: null,
    merge_commit_sha: null,
    html_url: "https://github.com/octo/repo/pull/7",
    head: { label: "octo:feature", ref: "feature", sha: "abc", user, repo: { full_name: "octo/repo" } },
    base: { label: "octo:main", ref: "main", sha: "def", user, repo: { full_name: "octo/repo" } },
    ...overrides,
  };
}

function createApp() {
  const app = createTestingApp();
  const service = new GitHubService(app);
  service.reconfigure(BASE_CONFIG);
  app.addService(GitHubService, service);
  return app;
}

type Methods = (typeof GitHubRpcSchema)["methods"];

/** Runs a method and checks the response against the wire schema, as the transport does. */
async function call<K extends keyof Methods>(app: ReturnType<typeof createApp>, method: K, args: unknown): Promise<z.output<Methods[K]["result"]>> {
  const endpoint = githubRPC.methods[method] as unknown as { execute: (args: unknown, app: unknown) => unknown };
  const input = GitHubRpcSchema.methods[method].input.parse(args);
  const result = await endpoint.execute(input, app);
  return GitHubRpcSchema.methods[method].result.parse(result) as z.output<Methods[K]["result"]>;
}

describe("GitHub RPC", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("keeps the wire schemas aligned with the domain types", () => {
    expect(wireSchemasMatchDomainTypes).toBe(true);
  });

  it("reports account status without exposing tokens", async () => {
    const app = createApp();
    const status = await call(app, "getStatus", {});

    expect(status).toMatchObject({
      hasOAuthClient: true,
      defaultAccount: "work",
      agentTypes: ["code"],
      accounts: [
        { name: "work", login: "octocat", isAuthenticated: true, usesPersonalAccessToken: true },
        { name: "personal", isAuthenticated: false, usesPersonalAccessToken: false },
      ],
    });
    expect(JSON.stringify(status)).not.toContain("ghp_pat");
  });

  it("lists and fetches issues as structured objects", async () => {
    const app = createApp();
    const requests = mockGitHub({
      "/repos/octo/repo/issues/1/comments": [
        { id: 5, body: "Same here", created_at: "2026-01-03T00:00:00Z", updated_at: "2026-01-03T00:00:00Z", html_url: "https://c", user },
      ],
      "/repos/octo/repo/issues/1": rawIssue(),
      "/repos/octo/repo/issues": [rawIssue(), rawIssue({ number: 2, pull_request: { url: "x" } })],
    });

    const listed = await call(app, "listIssues", { owner: "octo", repo: "repo", state: "open" });
    // Pull requests come back from the issues endpoint and are filtered out by default.
    expect(listed.issues.map(issue => issue.number)).toEqual([1]);
    expect(requests[0]!.url).toContain("state=open");

    const detail = await call(app, "getIssue", { owner: "octo", repo: "repo", issueNumber: 1 });
    expect(detail.issue.title).toBe("Something is broken");
    expect(detail.comments).toHaveLength(1);
    expect(detail.comments[0]!.author?.login).toBe("octocat");
  });

  it("posts issue comments and label changes", async () => {
    const app = createApp();
    const requests = mockGitHub({
      "/repos/octo/repo/issues/1/comments": {
        id: 9,
        body: "On it",
        created_at: "2026-01-03T00:00:00Z",
        updated_at: "2026-01-03T00:00:00Z",
        html_url: "https://c",
        user,
      },
      "/repos/octo/repo/issues/1/labels": [{ id: 10, name: "bug", color: "d73a4a", description: null }],
    });

    const { comment } = await call(app, "addIssueComment", { owner: "octo", repo: "repo", issueNumber: 1, body: "On it" });
    expect(comment.body).toBe("On it");
    expect(requests[0]).toMatchObject({ method: "POST", body: { body: "On it" } });

    const { labels } = await call(app, "addLabels", { owner: "octo", repo: "repo", issueNumber: 1, labels: ["bug"] });
    expect(labels.map(label => label.name)).toEqual(["bug"]);
    expect(requests[1]).toMatchObject({ method: "POST", body: { labels: ["bug"] } });
  });

  it("fetches a pull request with its reviews, comments, files and checks", async () => {
    const app = createApp();
    mockGitHub({
      "/repos/octo/repo/pulls/7/reviews": [
        { id: 1, user, body: "LGTM", state: "APPROVED", submitted_at: "2026-01-03T00:00:00Z", commit_id: "abc", html_url: "https://r" },
      ],
      "/repos/octo/repo/pulls/7/comments": [
        { id: 2, body: "nit", created_at: "2026-01-03T00:00:00Z", updated_at: "2026-01-03T00:00:00Z", html_url: "https://rc", user, path: "a.ts", line: 3 },
      ],
      "/repos/octo/repo/pulls/7/files": [
        {
          sha: "s",
          filename: "a.ts",
          status: "modified",
          additions: 1,
          deletions: 1,
          changes: 2,
          blob_url: "b",
          raw_url: "r",
          contents_url: "c",
          patch: "@@ -1 +1 @@\n-a\n+b",
        },
      ],
      "/repos/octo/repo/pulls/7": rawPull({ merged: false, mergeable: true, mergeable_state: "clean", additions: 1, deletions: 1, changed_files: 1 }),
      "/repos/octo/repo/issues/7/comments": [
        { id: 3, body: "thanks", created_at: "2026-01-04T00:00:00Z", updated_at: "2026-01-04T00:00:00Z", html_url: "https://ic", user },
      ],
      "/repos/octo/repo/commits/abc/status": {
        state: "success",
        sha: "abc",
        total_count: 1,
        statuses: [{ context: "ci", state: "success", description: "ok", target_url: "https://ci" }],
      },
      "/repos/octo/repo/commits/abc/check-runs": { total_count: 0, check_runs: [] },
    });

    const detail = await call(app, "getPullRequest", { owner: "octo", repo: "repo", prNumber: 7 });
    expect(detail.pullRequest.mergeable_state).toBe("clean");
    expect(detail.reviews[0]!.state).toBe("APPROVED");
    expect(detail.comments.map(comment => comment.kind).sort()).toEqual(["conversation", "review"]);

    const { files } = await call(app, "getPRFiles", { owner: "octo", repo: "repo", prNumber: 7 });
    expect(files[0]!.patch).toContain("+b");

    const { status } = await call(app, "getPRStatus", { owner: "octo", repo: "repo", prNumber: 7 });
    expect(status).toMatchObject({ state: "success", total: 1 });
  });

  it("submits a review with the chosen event", async () => {
    const app = createApp();
    const requests = mockGitHub({
      "/repos/octo/repo/pulls/7/reviews": {
        id: 4,
        user,
        body: "Needs work",
        state: "CHANGES_REQUESTED",
        submitted_at: "2026-01-03T00:00:00Z",
        commit_id: "abc",
        html_url: "https://r",
      },
      "/repos/octo/repo/pulls/7": rawPull(),
    });

    const { review } = await call(app, "reviewPullRequest", { owner: "octo", repo: "repo", prNumber: 7, event: "REQUEST_CHANGES", body: "Needs work" });
    expect(review.state).toBe("CHANGES_REQUESTED");
    const post = requests.find(request => request.method === "POST");
    expect(post?.body).toMatchObject({ event: "REQUEST_CHANGES", body: "Needs work" });
  });

  it("passes the navigator's list filters to GitHub", async () => {
    const app = createApp();
    const requests = mockGitHub({ "/repos/octo/repo/issues": [rawIssue()] });

    await call(app, "listIssues", { owner: "octo", repo: "repo", state: "all", labels: ["bug"], assignee: "octocat", sort: "comments" });
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("labels")).toBe("bug");
    expect(url.searchParams.get("assignee")).toBe("octocat");
    expect(url.searchParams.get("sort")).toBe("comments");
    expect(url.searchParams.get("state")).toBe("all");
  });

  it("merges a pull request with the chosen method, pinned to the reviewed head", async () => {
    const app = createApp();
    const requests = mockGitHub({
      "/repos/octo/repo/pulls/7/merge": { merged: true, message: "Pull Request successfully merged", sha: "merged-sha" },
    });

    const { result } = await call(app, "mergePullRequest", { owner: "octo", repo: "repo", prNumber: 7, method: "squash", sha: "abc", commitTitle: "  " });
    expect(result).toEqual({ merged: true, message: "Pull Request successfully merged", sha: "merged-sha" });
    expect(requests[0]!.method).toBe("PUT");
    // A blank title is left to GitHub's default rather than sent empty.
    expect(requests[0]!.body).toEqual({ merge_method: "squash", sha: "abc" });
  });

  it("explains a merge GitHub refuses", async () => {
    const app = createApp();
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: "Pull Request is not mergeable" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    await expect(call(app, "mergePullRequest", { owner: "octo", repo: "repo", prNumber: 7 })).rejects.toThrow(/not mergeable.*conflicts/);
  });

  it("creates a pull request and lists branches to pick from", async () => {
    const app = createApp();
    const requests = mockGitHub({
      "/repos/octo/repo/branches": [
        { name: "main", protected: true, commit: { sha: "1", url: "u" } },
        { name: "feature", protected: false, commit: { sha: "2", url: "u" } },
      ],
      "/repos/octo/repo/pulls": rawPull({ number: 9, title: "New thing", draft: true }),
    });

    const { branches } = await call(app, "listBranches", { owner: "octo", repo: "repo" });
    expect(branches).toEqual([
      { name: "main", protected: true },
      { name: "feature", protected: false },
    ]);

    const { pullRequest } = await call(app, "createPullRequest", {
      owner: "octo",
      repo: "repo",
      title: "New thing",
      head: "feature",
      base: "main",
      draft: true,
      body: "Body",
    });
    expect(pullRequest).toMatchObject({ number: 9, draft: true });
    const post = requests.find(request => request.method === "POST");
    expect(post?.body).toEqual({ title: "New thing", head: "feature", base: "main", draft: true, body: "Body" });
  });

  it("enables auto-merge through GraphQL with the pull request's node id", async () => {
    const app = createApp();
    const requests = mockGitHub({
      "/graphql": { data: { enablePullRequestAutoMerge: { clientMutationId: null } } },
      "/repos/octo/repo/pulls/7": rawPull({
        node_id: "PR_node7",
        auto_merge: { enabled_by: user, merge_method: "squash", commit_title: "t", commit_message: "m" },
      }),
    });

    const { pullRequest } = await call(app, "setAutoMerge", { owner: "octo", repo: "repo", prNumber: 7, enabled: true, method: "squash" });
    expect(pullRequest.auto_merge).toMatchObject({ merge_method: "squash" });
    const graphql = requests.find(request => request.url.endsWith("/graphql"));
    expect(graphql?.body).toMatchObject({ variables: { id: "PR_node7", mergeMethod: "SQUASH" } });
    expect((graphql?.body as { query?: string } | undefined)?.query).toContain("enablePullRequestAutoMerge");
  });

  it("finds no workspace repository when the workspace is not a checkout", async () => {
    const app = createApp();
    expect(await call(app, "getWorkspaceRepository", {})).toEqual({ repository: null });
  });
});
