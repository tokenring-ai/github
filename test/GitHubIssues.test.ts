import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import createTestingAgent from "@tokenring-ai/agent/test/createTestingAgent.test";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import ChatService from "../../chat/ChatService.ts";
import { formatIssueDetail, formatIssueTable } from "../formatIssue.ts";
import GitHubService from "../GitHubService.ts";
import type { ResolvedGitHubConfig } from "../schema.ts";
import addLabelsTool from "../tools/addLabels.ts";
import createIssueTool from "../tools/createIssue.ts";
import listIssuesTool from "../tools/listIssues.ts";
import { toGitHubIssue } from "../types.ts";

const BASE_CONFIG: ResolvedGitHubConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  clientType: "oauth-app",
  userAgent: "TokenRing",
  accounts: { work: { baseUrl: "https://api.github.com", scopes: ["repo"], token: "ghp_pat" } },
};

type RecordedRequest = { method: string; url: string; body: unknown };

/** Routes GitHub API calls to canned responses and records what was sent. */
function mockGitHub(routes: Record<string, unknown>) {
  const requests: RecordedRequest[] = [];

  const handler = mock(async (input: unknown, init?: unknown) => {
    const url = typeof input === "string" ? input : String((input as Request).url);
    const options = (init ?? {}) as { method?: string; body?: string };
    const method = options.method ?? "GET";

    requests.push({
      method,
      url,
      body: options.body ? JSON.parse(options.body) : undefined,
    });

    // Longest matching key wins, so `/issues/1/labels` beats `/issues`.
    const match = Object.keys(routes)
      .filter(key => url.startsWith(`https://api.github.com${key}`))
      .sort((a, b) => b.length - a.length)[0];

    if (match === undefined) throw new Error(`Unexpected fetch to ${method} ${url}`);

    return new Response(JSON.stringify(routes[match]), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  });

  (globalThis as { fetch: unknown }).fetch = handler;
  return requests;
}

function createService() {
  const app = createTestingApp();
  const service = new GitHubService(app);
  service.reconfigure(BASE_CONFIG);
  return { app, service };
}

function rawIssue(overrides: Record<string, unknown> = {}) {
  return {
    number: 1,
    title: "Something is broken",
    state: "open",
    locked: false,
    body: "It breaks.",
    labels: [{ id: 10, name: "bug", color: "d73a4a", description: "Not working" }],
    assignees: [{ login: "octocat", id: 583231, avatar_url: "https://a", html_url: "https://h", type: "User" }],
    milestone: null,
    comments: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    closed_at: null,
    html_url: "https://github.com/octo/repo/issues/1",
    user: { login: "reporter", id: 7, avatar_url: "https://a", html_url: "https://h", type: "User" },
    ...overrides,
  };
}

describe("GitHub issues", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("toGitHubIssue", () => {
    it("normalizes labels given as bare strings", () => {
      const issue = toGitHubIssue(rawIssue({ labels: ["bug", "p1"] }));
      expect(issue.labels).toEqual([
        { id: 0, name: "bug", color: "", description: null },
        { id: 0, name: "p1", color: "", description: null },
      ]);
    });

    it("maps GitHub's +1/-1 reaction keys", () => {
      const issue = toGitHubIssue(
        rawIssue({
          reactions: { total_count: 5, "+1": 3, "-1": 1, laugh: 0, confused: 0, hooray: 1, heart: 0, rocket: 0, eyes: 0 },
        }),
      );
      expect(issue.reactions).toMatchObject({ total_count: 5, plus_one: 3, minus_one: 1, hooray: 1 });
    });

    it("tolerates a missing author and assignees", () => {
      const issue = toGitHubIssue(rawIssue({ user: null, assignees: null }));
      expect(issue.author).toBeNull();
      expect(issue.assignees).toEqual([]);
    });

    it("flags pull requests and derives the repository from search results", () => {
      const issue = toGitHubIssue(
        rawIssue({ pull_request: { url: "https://api.github.com/repos/octo/repo/pulls/1" }, repository_url: "https://api.github.com/repos/octo/repo" }),
      );
      expect(issue.isPullRequest).toBe(true);
      expect(issue.repository).toBe("octo/repo");
    });

    it("treats an unknown state as open", () => {
      expect(toGitHubIssue(rawIssue({ state: "closed" })).state).toBe("closed");
      expect(toGitHubIssue(rawIssue({ state: "weird" })).state).toBe("open");
    });
  });

  describe("listIssues", () => {
    it("drops pull requests by default and keeps them on request", async () => {
      const { service } = createService();
      const payload = [rawIssue(), rawIssue({ number: 2, pull_request: { url: "https://api.github.com/repos/octo/repo/pulls/2" } })];

      mockGitHub({ "/repos/octo/repo/issues": payload });
      const withoutPRs = await service.listIssues("octo", "repo");
      expect(withoutPRs.map(issue => issue.number)).toEqual([1]);

      mockGitHub({ "/repos/octo/repo/issues": payload });
      const withPRs = await service.listIssues("octo", "repo", { includePullRequests: true });
      expect(withPRs.map(issue => issue.number)).toEqual([1, 2]);
    });

    it("passes filters through as GitHub query parameters", async () => {
      const { service } = createService();
      const requests = mockGitHub({ "/repos/octo/repo/issues": [] });

      await service.listIssues("octo", "repo", { state: "closed", labels: ["bug", "p1"], assignee: "octocat", sort: "updated", order: "asc", perPage: 5 });

      const url = new URL(requests[0]?.url as string);
      expect(url.searchParams.get("state")).toBe("closed");
      expect(url.searchParams.get("labels")).toBe("bug,p1");
      expect(url.searchParams.get("assignee")).toBe("octocat");
      expect(url.searchParams.get("sort")).toBe("updated");
      expect(url.searchParams.get("direction")).toBe("asc");
      expect(url.searchParams.get("per_page")).toBe("5");
    });
  });

  describe("createIssue", () => {
    it("posts the issue and returns the created number", async () => {
      const { service } = createService();
      const requests = mockGitHub({ "/repos/octo/repo/issues": rawIssue({ number: 42, title: "New bug" }) });

      const issue = await service.createIssue("octo", "repo", { title: "New bug", body: "Details", labels: ["bug"] });

      expect(issue.number).toBe(42);
      expect(requests[0]).toMatchObject({
        method: "POST",
        body: { title: "New bug", body: "Details", labels: ["bug"] },
      });
    });

    it("rejects an empty title before calling GitHub", async () => {
      const { service } = createService();
      const requests = mockGitHub({});

      await expect(service.createIssue("octo", "repo", { title: "   " })).rejects.toThrow(/title is required/);
      expect(requests).toHaveLength(0);
    });
  });

  describe("updateIssue", () => {
    it("sends a null milestone through so it clears, but omits absent fields", async () => {
      const { service } = createService();
      const requests = mockGitHub({ "/repos/octo/repo/issues/1": rawIssue({ state: "closed" }) });

      await service.updateIssue("octo", "repo", 1, { state: "closed", stateReason: "completed", milestone: null });

      expect(requests[0]?.method).toBe("PATCH");
      const body = requests[0]?.body as Record<string, unknown>;
      expect(body).toEqual({ state: "closed", state_reason: "completed", milestone: null });
      expect("title" in body).toBe(false);
    });
  });

  describe("searchIssues", () => {
    it("opts into advanced search and reports the repository per result", async () => {
      const { service } = createService();
      const requests = mockGitHub({
        "/search/issues": { total_count: 1, incomplete_results: false, items: [rawIssue({ repository_url: "https://api.github.com/repos/octo/repo" })] },
      });

      const issues = await service.searchIssues("is:open label:bug");

      const url = new URL(requests[0]?.url as string);
      expect(url.searchParams.get("q")).toBe("is:open label:bug");
      expect(url.searchParams.get("advanced_search")).toBe("true");
      expect(issues[0]?.repository).toBe("octo/repo");
    });

    it("rejects an empty query", async () => {
      const { service } = createService();
      await expect(service.searchIssues("  ")).rejects.toThrow(/query is required/);
    });
  });

  describe("labels", () => {
    it("adds labels and returns the resulting set", async () => {
      const { service } = createService();
      const requests = mockGitHub({
        "/repos/octo/repo/issues/1/labels": [
          { id: 10, name: "bug", color: "d73a4a", description: null },
          { id: 11, name: "p1", color: "eeeeee", description: null },
        ],
      });

      const labels = await service.addLabels("octo", "repo", 1, ["p1"]);

      expect(requests[0]).toMatchObject({ method: "POST", body: { labels: ["p1"] } });
      expect(labels.map(label => label.name)).toEqual(["bug", "p1"]);
    });

    it("refuses to add an empty label list", async () => {
      const { service } = createService();
      const requests = mockGitHub({});
      await expect(service.addLabels("octo", "repo", 1, [])).rejects.toThrow(/At least one label/);
      expect(requests).toHaveLength(0);
    });

    it("removes a label with a DELETE", async () => {
      const { service } = createService();
      const requests = mockGitHub({ "/repos/octo/repo/issues/1/labels/bug": [{ id: 11, name: "p1", color: "eeeeee", description: null }] });

      const remaining = await service.removeLabel("octo", "repo", 1, "bug");

      expect(requests[0]?.method).toBe("DELETE");
      expect(remaining.map(label => label.name)).toEqual(["p1"]);
    });
  });

  describe("formatting", () => {
    it("adds a Repository column only when results span repositories", () => {
      const local = formatIssueTable([toGitHubIssue(rawIssue())]);
      expect(local).not.toContain("Repository");

      const searched = formatIssueTable([toGitHubIssue(rawIssue({ repository_url: "https://api.github.com/repos/octo/repo" }))]);
      expect(searched).toContain("Repository");
      expect(searched).toContain("octo/repo");
    });

    it("truncates a long issue body", () => {
      const detail = formatIssueDetail(toGitHubIssue(rawIssue({ body: "x".repeat(20_000) })), "octo/repo");
      expect(detail).toContain("… (truncated)");
      expect(detail.length).toBeLessThan(10_000);
    });

    it("renders an empty body as a placeholder", () => {
      expect(formatIssueDetail(toGitHubIssue(rawIssue({ body: null })), "octo/repo")).toContain("_(no description)_");
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

    it("does not create an issue when approval is denied", async () => {
      const { agent, chatService } = createToolAgent();
      const requests = mockGitHub({ "/repos/octo/repo/issues": rawIssue() });
      spyOn(chatService, "checkToolApproval").mockResolvedValue(false);

      await expect(createIssueTool.execute(createIssueTool.inputSchema.parse({ owner: "octo", repo: "repo", title: "New bug" }), agent)).rejects.toThrow(
        /did not approve/,
      );
      expect(requests).toHaveLength(0);
    });

    it("creates the issue once approved", async () => {
      const { agent, chatService } = createToolAgent();
      const requests = mockGitHub({ "/repos/octo/repo/issues": rawIssue({ number: 42 }) });
      const approval = spyOn(chatService, "checkToolApproval").mockResolvedValue(true);

      const result = await createIssueTool.execute(createIssueTool.inputSchema.parse({ owner: "octo", repo: "repo", title: "New bug" }), agent);

      expect(requests).toHaveLength(1);
      expect(result.result).toContain("octo/repo#42");
      expect(approval.mock.calls[0]?.[0]).toMatchObject({ toolName: "github_createIssue", safetyLevel: 5 });
    });

    it("does not remove or add labels when approval is denied", async () => {
      const { agent, chatService } = createToolAgent();
      const requests = mockGitHub({ "/repos/octo/repo/issues/1/labels": [] });
      spyOn(chatService, "checkToolApproval").mockResolvedValue(false);

      await expect(
        addLabelsTool.execute(addLabelsTool.inputSchema.parse({ owner: "octo", repo: "repo", issueNumber: 1, labels: ["p1"] }), agent),
      ).rejects.toThrow(/did not approve/);
      expect(requests).toHaveLength(0);
    });

    it("does not gate read-only issue listing behind approval", async () => {
      const { agent, chatService } = createToolAgent();
      mockGitHub({ "/repos/octo/repo/issues": [rawIssue()] });
      const approval = spyOn(chatService, "checkToolApproval");

      const result = await listIssuesTool.execute(listIssuesTool.inputSchema.parse({ owner: "octo", repo: "repo" }), agent);

      expect(approval).not.toHaveBeenCalled();
      expect(result.result).toContain("Something is broken");
    });
  });
});
