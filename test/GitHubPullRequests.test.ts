import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import ChatService from "../../chat/ChatService.ts";
import { formatPRStatus, formatPRTable, pullRequestState } from "../formatPullRequest.ts";
import GitHubService from "../GitHubService.ts";
import { toGitHubPullRequest } from "../pullRequestTypes.ts";
import type { ResolvedGitHubConfig } from "../schema.ts";
import addPRReviewersTool from "../tools/addPRReviewers.ts";
import createPRTool from "../tools/createPR.ts";
import listPRsTool from "../tools/listPRs.ts";
import reviewPRTool from "../tools/reviewPR.ts";
import updatePRTool from "../tools/updatePR.ts";

const BASE_CONFIG: ResolvedGitHubConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  clientType: "oauth-app",
  userAgent: "TokenRing",
  accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo"], token: "ghp_pat" } },
};

type RecordedRequest = { method: string; url: string; body: unknown; headers: Record<string, string> };

/**
 * Routes GitHub API calls to canned responses and records what was sent. A string
 * route is served as a diff rather than JSON, which is how GitHub answers a
 * request carrying the diff media type.
 */
function mockGitHub(routes: Record<string, unknown>) {
  const requests: RecordedRequest[] = [];

  const handler = mock(async (input: unknown, init?: unknown) => {
    const url = typeof input === "string" ? input : String((input as Request).url);
    const options = (init ?? {}) as { method?: string; body?: string; headers?: Record<string, string> };
    const method = options.method ?? "GET";

    requests.push({
      method,
      url,
      body: options.body ? JSON.parse(options.body) : undefined,
      headers: options.headers ?? {},
    });

    // Longest matching key wins, so `/pulls/1/files` beats `/pulls/1`.
    const match = Object.keys(routes)
      .filter(key => url.startsWith(`https://api.github.com${key}`))
      .sort((a, b) => b.length - a.length)[0];

    if (match === undefined) throw new Error(`Unexpected fetch to ${method} ${url}`);

    const payload = routes[match];
    if (typeof payload === "string") {
      return new Response(payload, { status: 200, headers: { "content-type": "application/vnd.github.diff; charset=utf-8" } });
    }

    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
  });

  (globalThis as { fetch: unknown }).fetch = handler;
  return requests;
}

function createService() {
  const app = createTestingApp();
  const service = new GitHubService(app);
  service.reconfigure(BASE_CONFIG);
  return service;
}

const OCTOCAT = { login: "octocat", id: 583231, avatar_url: "https://a", html_url: "https://h", type: "User" };

/** The shape GitHub's `GET /pulls` returns: no diff stats, no mergeability. */
function rawPullSummary(overrides: Record<string, unknown> = {}) {
  return {
    number: 7,
    title: "Fix the streaming parser",
    state: "open",
    draft: false,
    locked: false,
    body: "Closes #3.",
    labels: [{ id: 10, name: "bug", color: "d73a4a", description: "Not working" }],
    assignees: [OCTOCAT],
    requested_reviewers: [{ ...OCTOCAT, login: "reviewer" }],
    requested_teams: [{ id: 1, name: "Core", slug: "core", description: null, html_url: "https://t" }],
    user: { ...OCTOCAT, login: "author" },
    milestone: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    closed_at: null,
    merged_at: null,
    merge_commit_sha: null,
    html_url: "https://github.com/octo/repo/pull/7",
    diff_url: "https://github.com/octo/repo/pull/7.diff",
    patch_url: "https://github.com/octo/repo/pull/7.patch",
    head: { label: "octo:fix-parser", ref: "fix-parser", sha: "headsha1", user: OCTOCAT, repo: { full_name: "octo/repo" } },
    base: { label: "octo:main", ref: "main", sha: "basesha1", user: OCTOCAT, repo: { full_name: "octo/repo" } },
    ...overrides,
  };
}

/** What `GET /pulls/{number}` adds on top of the summary. */
function rawPullDetail(overrides: Record<string, unknown> = {}) {
  return rawPullSummary({
    merged: false,
    mergeable: true,
    mergeable_state: "clean",
    rebaseable: true,
    merged_by: null,
    commits: 3,
    additions: 42,
    deletions: 7,
    changed_files: 2,
    comments: 1,
    review_comments: 4,
    ...overrides,
  });
}

describe("GitHub pull requests", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("toGitHubPullRequest", () => {
    it("leaves the detail-only fields unset on a listed pull request", () => {
      const pull = toGitHubPullRequest(rawPullSummary());

      expect(pull.number).toBe(7);
      expect(pull.head.ref).toBe("fix-parser");
      expect(pull.base.ref).toBe("main");
      expect(pull.requested_reviewers.map(user => user.login)).toEqual(["reviewer"]);
      expect(pull.requested_teams.map(team => team.slug)).toEqual(["core"]);
      // Not fetched, rather than zero.
      expect(pull.changed_files).toBeUndefined();
      expect(pull.additions).toBeUndefined();
      expect(pull.mergeable).toBeUndefined();
      expect(pull.commits).toBeUndefined();
    });

    it("populates the detail-only fields from a fetched pull request", () => {
      const pull = toGitHubPullRequest(rawPullDetail());

      expect(pull.changed_files).toBe(2);
      expect(pull.additions).toBe(42);
      expect(pull.deletions).toBe(7);
      expect(pull.commits).toBe(3);
      expect(pull.mergeable).toBe(true);
      expect(pull.mergeable_state).toBe("clean");
    });

    it("keeps a null mergeable distinct from an unfetched one", () => {
      // GitHub answers null while it computes mergeability in the background.
      expect(toGitHubPullRequest(rawPullDetail({ mergeable: null })).mergeable).toBeNull();
      expect(toGitHubPullRequest(rawPullSummary()).mergeable).toBeUndefined();
    });

    it("derives the repository and pull request URLs from a search result", () => {
      const pull = toGitHubPullRequest({
        ...rawPullSummary(),
        head: undefined,
        base: undefined,
        diff_url: undefined,
        patch_url: undefined,
        repository_url: "https://api.github.com/repos/octo/repo",
        pull_request: { diff_url: "https://github.com/octo/repo/pull/7.diff", patch_url: null, merged_at: "2026-02-01T00:00:00Z" },
      });

      expect(pull.repository).toBe("octo/repo");
      expect(pull.diff_url).toBe("https://github.com/octo/repo/pull/7.diff");
      expect(pull.merged_at).toBe("2026-02-01T00:00:00Z");
      // A search result carries no branch information at all.
      expect(pull.head.ref).toBe("");
    });

    it("survives a head branch whose repository was deleted", () => {
      const pull = toGitHubPullRequest(rawPullSummary({ head: { label: "gone:wip", ref: "wip", sha: "abc", repo: null } }));

      expect(pull.head.ref).toBe("wip");
      expect(pull.head.repository).toBeUndefined();
    });
  });

  describe("pullRequestState", () => {
    it("distinguishes the four states GitHub renders from two fields", () => {
      expect(pullRequestState(toGitHubPullRequest(rawPullSummary()))).toBe("open");
      expect(pullRequestState(toGitHubPullRequest(rawPullSummary({ draft: true })))).toBe("draft");
      expect(pullRequestState(toGitHubPullRequest(rawPullSummary({ state: "closed" })))).toBe("closed");
      // A merged pull request is closed, so the merge has to be checked first.
      expect(pullRequestState(toGitHubPullRequest(rawPullSummary({ state: "closed", merged_at: "2026-02-01T00:00:00Z" })))).toBe("merged");
    });
  });

  describe("listPullRequests", () => {
    it("sends the state, branch, and paging filters", async () => {
      const requests = mockGitHub({ "/repos/octo/repo/pulls": [rawPullSummary()] });

      await createService().listPullRequests("octo", "repo", { state: "closed", base: "main", head: "octo:fix", sort: "updated", perPage: 5 });

      const url = new URL(requests[0]?.url ?? "");
      expect(url.searchParams.get("state")).toBe("closed");
      expect(url.searchParams.get("base")).toBe("main");
      expect(url.searchParams.get("head")).toBe("octo:fix");
      expect(url.searchParams.get("sort")).toBe("updated");
      expect(url.searchParams.get("per_page")).toBe("5");
    });

    it("filters by label locally, since GitHub's pulls endpoint cannot", async () => {
      const requests = mockGitHub({
        "/repos/octo/repo/pulls": [rawPullSummary(), rawPullSummary({ number: 8, labels: [{ id: 11, name: "docs", color: "", description: null }] })],
      });

      const pulls = await createService().listPullRequests("octo", "repo", { labels: ["Bug"] });

      expect(pulls.map(pull => pull.number)).toEqual([7]);
      // The filter is applied to the response, not sent as a query parameter.
      expect(new URL(requests[0]?.url ?? "").searchParams.get("labels")).toBeNull();
    });
  });

  describe("searchPullRequests", () => {
    it("constrains the search to pull requests", async () => {
      const requests = mockGitHub({ "/search/issues": { total_count: 0, items: [] } });

      await createService().searchPullRequests("repo:octo/repo streaming");

      const url = new URL(requests[0]?.url ?? "");
      expect(url.searchParams.get("q")).toBe("repo:octo/repo streaming is:pr");
      expect(url.searchParams.get("advanced_search")).toBe("true");
    });

    it("leaves a query that already says what it wants alone", async () => {
      const requests = mockGitHub({ "/search/issues": { total_count: 0, items: [] } });

      await createService().searchPullRequests("is:pr is:merged author:octocat");

      expect(new URL(requests[0]?.url ?? "").searchParams.get("q")).toBe("is:pr is:merged author:octocat");
    });

    it("rejects an empty query before making a request", async () => {
      const requests = mockGitHub({});
      await expect(createService().searchPullRequests("   ")).rejects.toThrow(/query is required/);
      expect(requests).toHaveLength(0);
    });
  });

  describe("getPRDiff", () => {
    const DIFF = [
      "diff --git a/src/index.ts b/src/index.ts",
      "index 111..222 100644",
      "--- a/src/index.ts",
      "+++ b/src/index.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/README.md b/README.md",
      "index 333..444 100644",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1 +1 @@",
      "-docs",
      "+more docs",
      "",
    ].join("\n");

    it("asks for the diff media type and returns the raw text", async () => {
      const requests = mockGitHub({ "/repos/octo/repo/pulls/7": DIFF });

      const diff = await createService().getPRDiff("octo", "repo", 7);

      expect(requests[0]?.headers.accept).toBe("application/vnd.github.v3.diff");
      expect(diff).toContain("+new");
      expect(diff).toContain("+more docs");
    });

    it("keeps only the files the caller asked for", async () => {
      mockGitHub({ "/repos/octo/repo/pulls/7": DIFF });

      const diff = await createService().getPRDiff("octo", "repo", 7, { paths: ["README.md"] });

      expect(diff).toContain("+more docs");
      expect(diff).not.toContain("+new");
    });

    it("returns nothing when no file matches, rather than the whole diff", async () => {
      mockGitHub({ "/repos/octo/repo/pulls/7": DIFF });
      expect(await createService().getPRDiff("octo", "repo", 7, { paths: ["nowhere.ts"] })).toBe("");
    });

    it("truncates a diff past the cap", async () => {
      mockGitHub({ "/repos/octo/repo/pulls/7": `diff --git a/big.ts b/big.ts\n${"+x\n".repeat(5_000)}` });

      const diff = await createService().getPRDiff("octo", "repo", 7, { maxLength: 500 });

      expect(diff).toContain("… (diff truncated)");
      expect(diff.length).toBeLessThan(700);
    });
  });

  describe("getPRFiles", () => {
    it("truncates each file's patch on its own", async () => {
      mockGitHub({
        "/repos/octo/repo/pulls/7/files": [
          {
            sha: "abc",
            filename: "src/big.ts",
            status: "modified",
            additions: 5_000,
            deletions: 0,
            changes: 5_000,
            blob_url: "https://b",
            raw_url: "https://r",
            contents_url: "https://c",
            patch: "+x\n".repeat(5_000),
          },
        ],
      });

      const files = await createService().getPRFiles("octo", "repo", 7);

      expect(files[0]?.patch).toContain("… (patch truncated)");
      expect(files[0]?.patch?.length).toBeLessThan(5_000);
      expect(files[0]?.additions).toBe(5_000);
    });

    it("tolerates a file with no blob sha", async () => {
      mockGitHub({
        "/repos/octo/repo/pulls/7/files": [{ sha: null, filename: "vendor/dep", status: "modified", additions: 1, deletions: 1, changes: 2 }],
      });

      const files = await createService().getPRFiles("octo", "repo", 7);
      expect(files[0]).toMatchObject({ sha: "", filename: "vendor/dep", blob_url: "" });
    });
  });

  describe("getPRStatus", () => {
    function mockChecks(statuses: unknown[], checkRuns: unknown[]) {
      return mockGitHub({
        "/repos/octo/repo/pulls/7": rawPullDetail(),
        "/repos/octo/repo/commits/headsha1/status": { state: "success", sha: "headsha1", total_count: statuses.length, statuses },
        "/repos/octo/repo/commits/headsha1/check-runs": { total_count: checkRuns.length, check_runs: checkRuns },
      });
    }

    it("merges legacy commit statuses with Actions check runs", async () => {
      mockChecks(
        [{ context: "ci/legacy", description: "Build passed", state: "success", target_url: "https://l", created_at: "t", updated_at: "t" }],
        [
          {
            name: "test",
            status: "completed",
            conclusion: "success",
            html_url: "https://a",
            output: { title: "12 passed" },
            started_at: "t",
            completed_at: "t",
          },
        ],
      );

      const status = await createService().getPRStatus("octo", "repo", 7);

      expect(status.state).toBe("success");
      expect(status.sha).toBe("headsha1");
      expect(status.total).toBe(2);
      expect(status.statuses.map(check => check.source)).toEqual(["status", "check_run"]);
      expect(status.statuses.map(check => check.context)).toEqual(["ci/legacy", "test"]);
    });

    it("rolls up to the worst state among all checks", async () => {
      mockChecks(
        [{ context: "ci/legacy", description: "", state: "success", created_at: "t", updated_at: "t" }],
        [{ name: "test", status: "completed", conclusion: "failure", html_url: "https://a", output: { title: null }, started_at: "t", completed_at: "t" }],
      );

      expect((await createService().getPRStatus("octo", "repo", 7)).state).toBe("failure");
    });

    it("counts a skipped check as passing and an in-progress one as pending", async () => {
      mockChecks(
        [],
        [
          { name: "optional", status: "completed", conclusion: "skipped", html_url: "https://a", output: { title: null } },
          { name: "slow", status: "in_progress", conclusion: null, html_url: "https://b", output: { title: null } },
        ],
      );

      const status = await createService().getPRStatus("octo", "repo", 7);

      expect(status.statuses.map(check => check.state)).toEqual(["success", "pending"]);
      expect(status.state).toBe("pending");
    });

    it("pages past the first page of check runs, where a failure could hide", async () => {
      const passing = Array.from({ length: 100 }, (_, index) => ({
        name: `check-${index}`,
        status: "completed",
        conclusion: "success",
        html_url: "https://a",
        output: { title: null },
      }));
      const failing = { name: "check-100", status: "completed", conclusion: "failure", html_url: "https://a", output: { title: null } };

      const requestedPages: string[] = [];
      (globalThis as { fetch: unknown }).fetch = mock(async (input: unknown) => {
        const url = new URL(typeof input === "string" ? input : String((input as Request).url));
        const json = (payload: unknown) => new Response(JSON.stringify(payload), { headers: { "content-type": "application/json; charset=utf-8" } });

        if (url.pathname.endsWith("/check-runs")) {
          const page = url.searchParams.get("page") ?? "1";
          requestedPages.push(page);
          return json({ total_count: 101, check_runs: page === "1" ? passing : [failing] });
        }
        if (url.pathname.endsWith("/status")) return json({ state: "success", sha: "headsha1", total_count: 0, statuses: [] });
        return json(rawPullDetail());
      });

      const status = await createService().getPRStatus("octo", "repo", 7);

      expect(requestedPages).toEqual(["1", "2"]);
      expect(status.total).toBe(101);
      expect(status.state).toBe("failure");
    });

    it("reports pending when nothing has run at all", async () => {
      mockChecks([], []);

      const status = await createService().getPRStatus("octo", "repo", 7);

      expect(status).toMatchObject({ state: "pending", total: 0 });
      expect(formatPRStatus(status)).toContain("No status checks or check runs have reported");
    });
  });

  describe("reviewPullRequest", () => {
    it("refuses a bodiless REQUEST_CHANGES before making a request", async () => {
      const requests = mockGitHub({});

      await expect(createService().reviewPullRequest("octo", "repo", 7, { event: "REQUEST_CHANGES" })).rejects.toThrow(/review body is required/);
      expect(requests).toHaveLength(0);
    });

    it("allows an approval with no body", async () => {
      const requests = mockGitHub({
        "/repos/octo/repo/pulls/7/reviews": {
          id: 1,
          user: OCTOCAT,
          body: null,
          state: "APPROVED",
          submitted_at: "t",
          commit_id: "headsha1",
          html_url: "https://r",
        },
      });

      const review = await createService().reviewPullRequest("octo", "repo", 7, { event: "APPROVE" });

      expect(review.state).toBe("APPROVED");
      expect(requests[0]).toMatchObject({ method: "POST", body: { event: "APPROVE" } });
    });
  });

  describe("commentPullRequest", () => {
    const REVIEW_COMMENT = {
      id: 55,
      body: "This can be null here.",
      created_at: "2026-01-03T00:00:00Z",
      updated_at: "2026-01-03T00:00:00Z",
      html_url: "https://c",
      user: OCTOCAT,
      path: "src/index.ts",
      line: 42,
      commit_id: "headsha1",
    };

    it("posts to the issues endpoint when no path is given", async () => {
      const requests = mockGitHub({
        "/repos/octo/repo/issues/7/comments": { id: 1, body: "Looks good", created_at: "t", updated_at: "t", html_url: "https://c", user: OCTOCAT },
      });

      const comment = await createService().commentPullRequest("octo", "repo", 7, "Looks good");

      expect(comment.kind).toBe("conversation");
      expect(requests[0]?.url).toContain("/repos/octo/repo/issues/7/comments");
    });

    it("posts an inline review comment when a path and line are given", async () => {
      const requests = mockGitHub({
        "/repos/octo/repo/pulls/7": rawPullDetail(),
        "/repos/octo/repo/pulls/7/comments": REVIEW_COMMENT,
      });

      const comment = await createService().commentPullRequest("octo", "repo", 7, "This can be null here.", { path: "src/index.ts", line: 42 });

      expect(comment.kind).toBe("review");
      expect(comment.path).toBe("src/index.ts");

      const posted = requests.find(request => request.method === "POST");
      expect(posted?.url).toContain("/repos/octo/repo/pulls/7/comments");
      // The commit defaults to the pull request's current head.
      expect(posted?.body).toMatchObject({ path: "src/index.ts", line: 42, subject_type: "line", commit_id: "headsha1" });
    });

    it("comments on a whole file when no line is given", async () => {
      const requests = mockGitHub({ "/repos/octo/repo/pulls/7": rawPullDetail(), "/repos/octo/repo/pulls/7/comments": REVIEW_COMMENT });

      await createService().commentPullRequest("octo", "repo", 7, "Whole file note", { path: "src/index.ts" });

      expect(requests.find(request => request.method === "POST")?.body).toMatchObject({ subject_type: "file" });
    });

    it("uses the replies endpoint when replying to a review comment", async () => {
      const requests = mockGitHub({ "/repos/octo/repo/pulls/7/comments/55/replies": REVIEW_COMMENT });

      await createService().commentPullRequest("octo", "repo", 7, "Good catch, fixed.", { inReplyTo: 55 });

      expect(requests[0]?.url).toContain("/repos/octo/repo/pulls/7/comments/55/replies");
      // Replying needs no path lookup, so the pull request is never fetched.
      expect(requests).toHaveLength(1);
    });

    it("rejects an empty body before making a request", async () => {
      const requests = mockGitHub({});
      await expect(createService().commentPullRequest("octo", "repo", 7, "  ")).rejects.toThrow(/comment body is required/);
      expect(requests).toHaveLength(0);
    });
  });

  describe("updatePullRequest", () => {
    it("splits the update across the pulls and issues endpoints", async () => {
      const requests = mockGitHub({
        "/repos/octo/repo/pulls/7": rawPullDetail(),
        "/repos/octo/repo/issues/7": { ...rawPullDetail(), labels: [] },
      });

      await createService().updatePullRequest("octo", "repo", 7, { title: "Renamed", base: "develop", labels: ["p1"] });

      const patches = requests.filter(request => request.method === "PATCH");
      expect(patches.map(patch => patch.url.replace("https://api.github.com", ""))).toEqual(["/repos/octo/repo/pulls/7", "/repos/octo/repo/issues/7"]);
      expect(patches[0]?.body).toEqual({ title: "Renamed", base: "develop" });
      expect(patches[1]?.body).toEqual({ labels: ["p1"] });
      // The result is re-read so the caller gets one consistent pull request.
      expect(requests.at(-1)).toMatchObject({ method: "GET", url: expect.stringContaining("/repos/octo/repo/pulls/7") });
    });

    it("touches no endpoint it has nothing to say to", async () => {
      const requests = mockGitHub({ "/repos/octo/repo/pulls/7": rawPullDetail() });

      await createService().updatePullRequest("octo", "repo", 7, { title: "Renamed" });

      expect(requests.filter(request => request.method === "PATCH")).toHaveLength(1);
      expect(requests.some(request => request.url.includes("/issues/7"))).toBe(false);
    });
  });

  describe("listPRComments", () => {
    const REVIEW_COMMENT = {
      id: 2,
      body: "inline",
      created_at: "2026-01-02T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      html_url: "https://c2",
      user: OCTOCAT,
      path: "src/index.ts",
      line: 3,
    };
    const ISSUE_COMMENT = {
      id: 1,
      body: "thread",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      html_url: "https://c1",
      user: OCTOCAT,
    };

    it("interleaves the review and conversation streams by creation time", async () => {
      mockGitHub({ "/repos/octo/repo/pulls/7/comments": [REVIEW_COMMENT], "/repos/octo/repo/issues/7/comments": [ISSUE_COMMENT] });

      const comments = await createService().listPRComments("octo", "repo", 7);

      expect(comments.map(comment => comment.kind)).toEqual(["conversation", "review"]);
      expect(comments.map(comment => comment.body)).toEqual(["thread", "inline"]);
    });

    it("fetches only the stream that was asked for", async () => {
      const requests = mockGitHub({ "/repos/octo/repo/pulls/7/comments": [REVIEW_COMMENT], "/repos/octo/repo/issues/7/comments": [ISSUE_COMMENT] });

      const comments = await createService().listPRComments("octo", "repo", 7, { include: "review" });

      expect(comments.map(comment => comment.kind)).toEqual(["review"]);
      expect(requests.some(request => request.url.includes("/issues/7/comments"))).toBe(false);
    });
  });

  describe("addPRReviewers", () => {
    it("rejects a request with nobody in it", async () => {
      const requests = mockGitHub({});
      await expect(createService().addPRReviewers("octo", "repo", 7, [])).rejects.toThrow(/At least one reviewer/);
      expect(requests).toHaveLength(0);
    });

    it("omits an empty team list rather than sending it", async () => {
      const requests = mockGitHub({ "/repos/octo/repo/pulls/7/requested_reviewers": rawPullSummary() });

      await createService().addPRReviewers("octo", "repo", 7, ["reviewer"]);

      expect(requests[0]?.body).toEqual({ reviewers: ["reviewer"] });
    });
  });

  describe("formatting", () => {
    it("adds a Repository column only when results span repositories", () => {
      expect(formatPRTable([toGitHubPullRequest(rawPullSummary())])).not.toContain("Repository");

      const searched = formatPRTable([toGitHubPullRequest({ ...rawPullSummary(), repository_url: "https://api.github.com/repos/octo/repo" })]);
      expect(searched).toContain("Repository");
      expect(searched).toContain("octo/repo");
    });

    it("shows the branch pair and omits diff stats that were never fetched", () => {
      const table = formatPRTable([toGitHubPullRequest(rawPullSummary())]);
      expect(table).toContain("fix-parser → main");
    });
  });

  describe("tool approval", () => {
    function createToolAgent() {
      const app = createTestingApp();
      const service = new GitHubService(app);
      service.reconfigure(BASE_CONFIG);
      app.addService(service);

      // Spawn before registering ChatService: the testing agent config has no `chat`
      // section, so attaching it would fail. Tools resolve services from the app, not
      // from what got attached to the agent.
      const agent = createTestingAgent(app);
      const chatService = new ChatService(app);
      app.addService(chatService);

      return { agent, chatService };
    }

    it("does not open a pull request when approval is denied", async () => {
      const { agent, chatService } = createToolAgent();
      const requests = mockGitHub({ "/repos/octo/repo/pulls": rawPullDetail() });
      spyOn(chatService, "checkToolApproval").mockResolvedValue(false);

      await expect(
        createPRTool.execute(createPRTool.inputSchema.parse({ owner: "octo", repo: "repo", title: "Fix it", head: "fix", base: "main" }), agent),
      ).rejects.toThrow(/did not approve/);
      expect(requests).toHaveLength(0);
    });

    it("opens the pull request once approved", async () => {
      const { agent, chatService } = createToolAgent();
      const requests = mockGitHub({ "/repos/octo/repo/pulls": rawPullDetail({ number: 42 }) });
      const approval = spyOn(chatService, "checkToolApproval").mockResolvedValue(true);

      const result = await createPRTool.execute(
        createPRTool.inputSchema.parse({ owner: "octo", repo: "repo", title: "Fix it", head: "fix", base: "main" }),
        agent,
      );

      expect(requests).toHaveLength(1);
      expect(result.result).toContain("octo/repo#42");
      expect(approval.mock.calls[0]?.[0]).toMatchObject({ toolName: "github_createPR", safetyLevel: 6 });
    });

    it("does not submit a review when approval is denied", async () => {
      const { agent, chatService } = createToolAgent();
      const requests = mockGitHub({ "/repos/octo/repo/pulls/7/reviews": {} });
      const approval = spyOn(chatService, "checkToolApproval").mockResolvedValue(false);

      await expect(reviewPRTool.execute(reviewPRTool.inputSchema.parse({ owner: "octo", repo: "repo", prNumber: 7, event: "APPROVE" }), agent)).rejects.toThrow(
        /did not approve/,
      );

      expect(requests).toHaveLength(0);
      expect(approval.mock.calls[0]?.[0]).toMatchObject({ toolName: "github_reviewPR", safetyLevel: 6 });
    });

    it("refuses an update that changes nothing, without prompting", async () => {
      const { agent, chatService } = createToolAgent();
      const requests = mockGitHub({ "/repos/octo/repo/pulls/7": rawPullDetail() });
      const approval = spyOn(chatService, "checkToolApproval").mockResolvedValue(true);

      await expect(updatePRTool.execute(updatePRTool.inputSchema.parse({ owner: "octo", repo: "repo", prNumber: 7 }), agent)).rejects.toThrow(
        /No fields to update/,
      );

      expect(approval).not.toHaveBeenCalled();
      expect(requests).toHaveLength(0);
    });

    it("refuses a reviewer request naming nobody, without prompting", async () => {
      const { agent, chatService } = createToolAgent();
      const requests = mockGitHub({ "/repos/octo/repo/pulls/7/requested_reviewers": rawPullDetail() });
      const approval = spyOn(chatService, "checkToolApproval").mockResolvedValue(true);

      await expect(
        addPRReviewersTool.execute(addPRReviewersTool.inputSchema.parse({ owner: "octo", repo: "repo", prNumber: 7, reviewers: [] }), agent),
      ).rejects.toThrow(/At least one reviewer/);

      expect(approval).not.toHaveBeenCalled();
      expect(requests).toHaveLength(0);
    });

    it("does not gate read-only pull request listing behind approval", async () => {
      const { agent, chatService } = createToolAgent();
      mockGitHub({ "/repos/octo/repo/pulls": [rawPullSummary()] });
      const approval = spyOn(chatService, "checkToolApproval");

      const result = await listPRsTool.execute(listPRsTool.inputSchema.parse({ owner: "octo", repo: "repo" }), agent);

      expect(approval).not.toHaveBeenCalled();
      expect(result.result).toContain("Fix the streaming parser");
    });
  });
});
