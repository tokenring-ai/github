import { beforeEach, describe, expect, it, mock } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import { createLayoutRegistry } from "@tokenring-ai/one-frontend/layout/registry.ts";
import { renderLayoutApp } from "@tokenring-ai/one-frontend/test/layout.tsx";
import { MessageSquare } from "lucide-react";
import type React from "react";
import useSWR, { SWRConfig } from "swr";

const PassThroughFocusTrap = ({ children }: { children: React.ReactNode }) => children;
void mock.module("focus-trap-react", () => ({ FocusTrap: PassThroughFocusTrap, default: PassThroughFocusTrap }));

const octocat = { login: "octocat", id: 1, avatar_url: "https://avatars.example/octocat", html_url: "https://github.com/octocat", type: "User" as const };
const bug = { id: 10, name: "bug", color: "d73a4a", description: "Something is broken" };
const docs = { id: 11, name: "docs", color: "0075ca", description: null };

const issueOne = {
  number: 1,
  title: "Crash on startup",
  state: "open" as const,
  locked: false,
  body: "It **crashes** when launched.",
  labels: [bug],
  assignees: [octocat],
  comments: 1,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  html_url: "https://github.com/octo/repo/issues/1",
  author: octocat,
  isPullRequest: false,
};

const issueTwo = {
  ...issueOne,
  number: 2,
  title: "Docs are outdated",
  state: "closed" as const,
  labels: [docs],
  assignees: [],
  comments: 0,
  closed_at: "2026-09-03T00:00:00Z",
  html_url: "https://github.com/octo/repo/issues/2",
};

const pullSeven = {
  number: 7,
  title: "Add feature flag",
  state: "open" as const,
  draft: false,
  locked: false,
  body: "Adds the flag.",
  labels: [],
  assignees: [],
  requested_reviewers: [],
  requested_teams: [],
  author: octocat,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-04T00:00:00Z",
  html_url: "https://github.com/octo/repo/pull/7",
  head: { label: "octo:feature", ref: "feature", sha: "abc1234" },
  base: { label: "octo:main", ref: "main", sha: "def5678" },
  changed_files: 1,
  additions: 2,
  deletions: 1,
  mergeable_state: "clean",
};

const comment = {
  id: 50,
  body: "Same here",
  created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  html_url: "https://github.com/c/50",
  author: octocat,
};

const codeAgent = {
  id: "agent-1",
  createdAt: 1_700_000_000_000,
  agentType: "code",
  displayName: "Coding Agent",
  description: "",
  idle: true,
  currentActivity: "",
};

const state = {
  accounts: [
    {
      name: "work",
      login: "octocat",
      baseUrl: "https://api.github.com",
      scopes: ["repo"],
      isAuthenticated: true,
      usesPersonalAccessToken: false,
      profile: { login: "octocat" },
    },
  ],
  hasOAuthClient: true,
  workspaceRepository: { host: "github.com", owner: "octo", repo: "repo", remoteUrl: "git@github.com:octo/repo.git" } as {
    host: string;
    owner: string;
    repo: string;
    remoteUrl: string;
  } | null,
  issues: [issueOne, issueTwo],
  pulls: [pullSeven],
  agents: [] as (typeof codeAgent)[],
};

const addIssueComment = mock(async (_args: Record<string, unknown>) => ({ comment }));
const updateIssue = mock(async (args: Record<string, unknown>) => ({ issue: { ...issueOne, ...args } }));
const addLabels = mock(async () => ({ labels: [bug, docs] }));
const removeLabel = mock(async () => ({ labels: [] }));
const createIssue = mock(async (args: Record<string, unknown> & { title: string }) => ({ issue: { ...issueOne, number: 3, title: args.title } }));
const reviewPullRequest = mock(async (_args: Record<string, unknown>) => ({
  review: {
    id: 9,
    author: octocat,
    body: "",
    state: "APPROVED",
    submitted_at: "2026-09-05T00:00:00Z",
    commit_id: "abc1234",
    html_url: "https://github.com/r/9",
  },
}));
const commentPullRequest = mock(async () => ({ comment: { ...comment, kind: "conversation" } }));
const closePullRequest = mock(async () => ({ pullRequest: { ...pullSeven, state: "closed" } }));
const updatePullRequest = mock(async () => ({ pullRequest: pullSeven }));
const addPRReviewers = mock(async () => ({ pullRequest: pullSeven }));
const beginAuthorization = mock(async (_args: { account: string }) => ({
  authorizationUrl: "https://github.com/login/oauth/authorize?state=x",
  redirectUri: "http://127.0.0.1:1/oauth/github/callback",
}));
const revokeAuthorization = mock(async () => ({ status: "success" as const }));
const createAgent = mock(async (_args: { agentType: string; headless: boolean }) => ({ id: "agent-new", displayName: "Coding Agent", description: "" }));
const deleteAgent = mock(async () => ({ status: "success" as const }));
const mutateList = mock(async () => undefined);
const searchIssues = mock(async (_args: Record<string, unknown>) => ({ issues: [] as (typeof issueOne)[] }));
const searchPullRequests = mock(async (_args: Record<string, unknown>) => ({ pullRequests: [] as (typeof pullSeven)[] }));
const listIssues = mock(async (args: { state: string; labels?: string[]; assignee?: string }) => ({
  issues: state.issues.filter(
    issue =>
      (args.state === "all" || issue.state === args.state) &&
      (!args.labels || issue.labels.some(label => args.labels!.includes(label.name))) &&
      (!args.assignee || issue.assignees.some(user => user.login === args.assignee)),
  ),
}));
const listPullRequests = mock(async (args: { state: string }) => ({
  pullRequests: state.pulls.filter(pull => args.state === "all" || pull.state === args.state),
}));
const listBranches = mock(async () => ({
  branches: [
    { name: "main", protected: true },
    { name: "feature", protected: false },
  ],
}));
const getRepository = mock(async () => ({
  repository: {
    name: "repo",
    full_name: "octo/repo",
    description: null,
    html_url: "https://github.com/octo/repo",
    stargazers_count: 0,
    language: null,
    default_branch: "main",
  },
}));
const createPullRequest = mock(async (args: Record<string, unknown> & { title: string }) => ({ pullRequest: { ...pullSeven, number: 8, title: args.title } }));
const mergePullRequest = mock(async (_args: Record<string, unknown>) => ({ result: { merged: true, message: "Merged", sha: "m1" } }));
const setAutoMerge = mock(async (_args: Record<string, unknown>) => ({ pullRequest: pullSeven }));

const swr = <T,>(data: T | undefined, error?: unknown) => ({ data, error, isLoading: false, isValidating: false, mutate: mutateList });

const actualRpc = await import("@tokenring-ai/one-frontend/rpc.ts");
void mock.module("@tokenring-ai/one-frontend/rpc.ts", () => ({
  ...actualRpc,
  useGitHubStatus: () => swr({ hasOAuthClient: state.hasOAuthClient, defaultAccount: "work", agentTypes: ["code"], accounts: state.accounts }),
  useGitHubWorkspaceRepository: () => swr({ repository: state.workspaceRepository }),
  useGitHubRepositorySearch: () => swr(undefined),
  useGitHubLabels: () => swr({ labels: [bug, docs] }),
  useGitHubIssue: (ref: { owner: string } | null, number: number | undefined) => {
    const issue = ref && number ? state.issues.find(candidate => candidate.number === number) : undefined;
    return swr(issue ? { issue, comments: number === 1 ? [comment] : [] } : undefined, ref && number && !issue ? new Error("Not Found") : undefined);
  },
  useGitHubPullRequest: (ref: { owner: string } | null, number: number | undefined) => {
    const pull = ref && number ? state.pulls.find(candidate => candidate.number === number) : undefined;
    return swr(pull ? { pullRequest: pull, reviews: [], comments: [{ ...comment, kind: "conversation" }] } : undefined);
  },
  useGitHubPRFiles: () =>
    swr({
      files: [
        {
          sha: "s",
          filename: "src/flag.ts",
          status: "modified",
          additions: 2,
          deletions: 1,
          changes: 3,
          blob_url: "",
          raw_url: "",
          contents_url: "",
          patch: "@@ -1 +1,2 @@\n-old\n+new\n+more",
        },
      ],
    }),
  useGitHubPRStatus: () =>
    swr({
      status: {
        state: "success",
        sha: "abc1234",
        total: 1,
        statuses: [{ source: "check_run", context: "ci / test", description: "All green", state: "success" }],
      },
    }),
  githubRPCClient: {
    addIssueComment,
    updateIssue,
    addLabels,
    removeLabel,
    createIssue,
    reviewPullRequest,
    commentPullRequest,
    closePullRequest,
    updatePullRequest,
    addPRReviewers,
    beginAuthorization,
    revokeAuthorization,
    searchIssues,
    searchPullRequests,
    listIssues,
    listPullRequests,
    listBranches,
    getRepository,
    createPullRequest,
    mergePullRequest,
    setAutoMerge,
  },
  useTypedSWR: (key: string | null, fetcher: () => Promise<unknown>) => useSWR(key, fetcher, { dedupingInterval: 0 }),
  useAgentList: () => ({ data: state.agents, isLoading: false, error: undefined, mutate: mock(async () => undefined) }),
  agentRPCClient: { createAgent, deleteAgent },
}));

const { GITHUB_APP } = await import("../layout.ts");
const { default: githubViews } = await import("../views.tsx");
const { clearGitHubDrafts } = await import("../lib/githubStore.ts");

function ChatStub() {
  return <p>chat stub</p>;
}

const chatView = defineView({
  id: "chat",
  kind: "agent",
  title: params => params.agentId ?? "Chat",
  icon: MessageSquare,
  route: "agent/:agentId",
  instanceKey: params => params.agentId ?? "",
  component: ChatStub,
});

const registry = createLayoutRegistry({
  apps: [GITHUB_APP],
  views: [...githubViews.views, chatView],
  kinds: [
    { id: "navigator", label: "Navigators", plural: "navigators" },
    { id: "agent", label: "Agents", plural: "agent chats" },
    { id: "github", label: "GitHub", plural: "GitHub tabs" },
  ],
});

function Fresh({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

const renderApp = (url = "/github") => renderLayoutApp({ registry, url, wrapper: Fresh });
const tab = (name: string | RegExp) => screen.queryByRole("tab", { name });
const hasBadge = (label: string) => screen.queryAllByRole("img", { name: label }).length > 0;

const ISSUE_URL = "/github/octo/repo/issues/1";
const PULL_URL = "/github/octo/repo/pulls/7";

describe("GitHub app", () => {
  beforeEach(() => {
    localStorage.clear();
    clearGitHubDrafts();
    for (const fn of [
      addIssueComment,
      updateIssue,
      addLabels,
      removeLabel,
      createIssue,
      reviewPullRequest,
      commentPullRequest,
      closePullRequest,
      updatePullRequest,
      addPRReviewers,
      beginAuthorization,
      revokeAuthorization,
      createAgent,
      deleteAgent,
      mutateList,
      searchIssues,
      searchPullRequests,
      listIssues,
      listPullRequests,
      listBranches,
      getRepository,
      createPullRequest,
      mergePullRequest,
      setAutoMerge,
    ]) {
      fn.mockClear();
    }
    state.workspaceRepository = { host: "github.com", owner: "octo", repo: "repo", remoteUrl: "git@github.com:octo/repo.git" };
    state.agents = [];
    state.issues = [issueOne, issueTwo];
    state.pulls = [pullSeven];
    state.hasOAuthClient = true;
    state.accounts = [
      {
        name: "work",
        login: "octocat",
        baseUrl: "https://api.github.com",
        scopes: ["repo"],
        isAuthenticated: true,
        usesPersonalAccessToken: false,
        profile: { login: "octocat" },
      },
    ];
  });

  describe("routes", () => {
    it("resolves every old URL shape", () => {
      expect(registry.routes.resolve("/github")).toMatchObject({ app: "github", viewId: "github-start" });
      expect(registry.routes.resolve("/github/octo/repo")).toMatchObject({ viewId: "github-start", params: { owner: "octo", repo: "repo" } });
      expect(registry.routes.resolve("/github/accounts")).toMatchObject({ viewId: "github-accounts" });
      expect(registry.routes.resolve("/github/octo/repo/issues/new")).toMatchObject({ viewId: "github-issue-create", params: { owner: "octo", repo: "repo" } });
      expect(registry.routes.resolve("/github/octo/repo/pulls/new")).toMatchObject({ viewId: "github-pull-create", params: { owner: "octo", repo: "repo" } });
      expect(registry.routes.resolve(ISSUE_URL)).toMatchObject({
        viewId: "github-item",
        params: { owner: "octo", repo: "repo", kind: "issues", number: "1" },
      });
      expect(registry.routes.resolve(PULL_URL)).toMatchObject({ viewId: "github-item", params: { kind: "pulls", number: "7" } });
      expect(registry.routes.urlFor("github", "github-item", { owner: "octo", repo: "repo", kind: "pulls", number: "7" })).toBe(PULL_URL);
      expect(registry.routes.urlFor("github", "github-pull-create", { owner: "acme", repo: "api" })).toBe("/github/acme/api/pulls/new");
    });

    it("makes the route's repository the selected one", async () => {
      localStorage.setItem("github:repo", JSON.stringify("octo/repo"));
      renderApp("/github/acme/api/issues/new");

      await waitFor(() => expect(JSON.parse(localStorage.getItem("github:repo") ?? "null")).toBe("acme/api"));
      expect(JSON.parse(localStorage.getItem("github:recent-repos") ?? "[]")).toEqual(["acme/api"]);
      expect(tab(/New issue · api/)).toBeInTheDocument();
    });

    it("shows the landing content for a URL that is not an item", async () => {
      renderApp("/github/octo/repo/pulls/x");
      expect(await screen.findByText("Select an issue or pull request")).toBeInTheDocument();
    });
  });

  describe("navigator", () => {
    it("pre-selects the workspace repository and lists its open issues", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      expect(await screen.findByRole("button", { name: "Select repository" })).toHaveTextContent("octo/repo");
      expect(screen.getByText("Crash on startup")).toBeInTheDocument();
      expect(screen.queryByText("Docs are outdated")).not.toBeInTheDocument();
      expect(screen.getByText("1 issues")).toBeInTheDocument();

      await user.click(screen.getByText("Crash on startup"));
      expect(app.location().pathname).toBe(ISSUE_URL);
      await waitFor(() => expect(tab(/#1 Crash on startup/)).toBeInTheDocument());
      // The landing tab has done its job.
      expect(tab("Select an issue")).not.toBeInTheDocument();
    });

    it("filters by state and by text, and switches to pull requests", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      await user.click(await screen.findByRole("radio", { name: "Closed" }));
      expect(screen.getByText("Docs are outdated")).toBeInTheDocument();
      expect(screen.queryByText("Crash on startup")).not.toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: "All" }));
      await user.type(screen.getByLabelText("Filter issues"), "docs");
      expect(screen.getByText("Docs are outdated")).toBeInTheDocument();
      expect(screen.queryByText("Crash on startup")).not.toBeInTheDocument();

      await user.clear(screen.getByLabelText("Filter issues"));
      await user.click(screen.getByRole("button", { name: /Pull requests/ }));
      expect(await screen.findByText("Add feature flag")).toBeInTheDocument();
      await user.click(screen.getByText("Add feature flag"));
      expect(app.location().pathname).toBe(PULL_URL);
    });

    it("filters issues by label, assignee and sort on the server", async () => {
      const user = userEvent.setup();
      renderApp();
      expect(await screen.findByText("Crash on startup")).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText("Label filter"), "docs");
      await waitFor(() => expect(listIssues).toHaveBeenLastCalledWith(expect.objectContaining({ labels: ["docs"], state: "open", sort: "updated" })));
      expect(await screen.findByText("No open issues match these filters")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Clear filters" }));
      expect(await screen.findByText("Crash on startup")).toBeInTheDocument();

      await user.type(screen.getByLabelText("Assignee filter"), "@octocat");
      await user.selectOptions(screen.getByLabelText("Sort"), "comments");
      await waitFor(() => expect(listIssues).toHaveBeenLastCalledWith(expect.objectContaining({ assignee: "octocat", sort: "comments" })));
      expect(JSON.parse(localStorage.getItem("github:list-sort") ?? "null")).toBe("comments");

      // Pull requests have no assignee filter, and a sort they lack falls back to recently updated.
      await user.click(screen.getByRole("button", { name: /Pull requests/ }));
      expect(await screen.findByText("Add feature flag")).toBeInTheDocument();
      expect(screen.queryByLabelText("Assignee filter")).not.toBeInTheDocument();
      expect(listPullRequests).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "updated", direction: "desc" }));
    });

    it("opens the new pull request form from the header", async () => {
      const user = userEvent.setup();
      const app = renderApp();
      await user.click(await screen.findByRole("button", { name: "New pull request" }));
      expect(app.location().pathname).toBe("/github/octo/repo/pulls/new");
      expect(await screen.findByRole("button", { name: /Open pull request/ })).toBeInTheDocument();
    });

    it("opens the create form and the accounts view from the header", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      await user.click((await screen.findAllByRole("button", { name: "New issue" }))[0]!);
      expect(app.location().pathname).toBe("/github/octo/repo/issues/new");
      await waitFor(() => expect(tab(/New issue · repo/)).toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: "GitHub accounts" }));
      expect(app.location().pathname).toBe("/github/accounts");
      await waitFor(() => expect(tab("GitHub accounts")).toBeInTheDocument());
    });

    it("switching repositories closes the other repository's panels and remembers the choice", async () => {
      const user = userEvent.setup();
      localStorage.setItem("github:recent-repos", JSON.stringify(["acme/widgets"]));
      const app = renderApp(ISSUE_URL);
      await waitFor(() => expect(tab(/#1 Crash on startup/)).toBeInTheDocument());

      await user.click(await screen.findByRole("button", { name: "Select repository" }));
      await user.click(screen.getByRole("menuitem", { name: /acme\/widgets/ }));

      await waitFor(() => expect(tab(/#1 Crash on startup/)).not.toBeInTheDocument());
      expect(JSON.parse(localStorage.getItem("github:repo") ?? "null")).toBe("acme/widgets");
      expect(app.location().pathname).toBe("/github/acme/widgets");
      expect(screen.getByRole("button", { name: "Select repository" })).toHaveTextContent("acme/widgets");
    });

    it("opens a typed owner/repo slug", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      await user.click(await screen.findByRole("button", { name: "Select repository" }));
      await user.type(screen.getByLabelText("Repository slug or search"), "foo/bar{Enter}");
      expect(JSON.parse(localStorage.getItem("github:repo") ?? "null")).toBe("foo/bar");
      expect(app.location().pathname).toBe("/github/foo/bar");
    });

    it("lists agents and docks a chat for the attached one", async () => {
      state.agents = [codeAgent];
      renderApp();

      expect(await screen.findByText("Coding Agent")).toBeInTheDocument();
      await waitFor(() => expect(tab(/agent-1/)).toBeInTheDocument());
    });

    it("highlights the routed item in its own repository", async () => {
      renderApp(ISSUE_URL);
      expect(await screen.findByTestId("github-row-issue-1")).toHaveAttribute("aria-current", "true");
    });

    it("does not highlight another repository's item of the same number", async () => {
      renderApp("/github/octo/repo");
      expect(await screen.findByTestId("github-row-issue-1")).not.toHaveAttribute("aria-current");
    });

    it("still browses anonymously when no account is configured", async () => {
      state.accounts = [];
      renderApp();
      expect(await screen.findByText(/No GitHub account configured/)).toBeInTheDocument();
      expect(screen.getByText("Crash on startup")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "New issue" })[0]).toBeDisabled();
    });

    it("explains a disabled New issue when the account is not signed in", async () => {
      state.accounts = [{ ...state.accounts[0]!, isAuthenticated: false }];
      const app = renderApp();
      const button = (await screen.findAllByRole("button", { name: "New issue" }))[0]!;
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", expect.stringContaining("Sign in"));

      await userEvent.setup().click(screen.getByRole("button", { name: "Sign in →" }));
      expect(app.location().pathname).toBe("/github/accounts");
    });

    it("searches GitHub when the filter is typed over a capped list", async () => {
      const user = userEvent.setup();
      state.issues = Array.from({ length: 100 }, (_, index) => ({ ...issueOne, number: 1000 + index, title: `Bulk issue ${index}` }));
      searchIssues.mockImplementationOnce(async () => ({ issues: [{ ...issueOne, number: 4242, title: "Zebra stripes render wrong" }] }));
      renderApp();

      expect(await screen.findByText(/first 100; filter to search all/)).toBeInTheDocument();
      await user.type(screen.getByLabelText("Filter issues"), "zebra");

      expect(await screen.findByText("Zebra stripes render wrong")).toBeInTheDocument();
      expect(searchIssues.mock.calls.at(-1)![0]).toMatchObject({ query: "zebra repo:octo/repo is:issue is:open", perPage: 100 });
      expect(screen.getByText("1 issues found on GitHub")).toBeInTheDocument();
    });

    it("filters a complete list locally without searching GitHub", async () => {
      const user = userEvent.setup();
      renderApp();
      await user.type(await screen.findByLabelText("Filter issues"), "crash");
      expect(screen.getByText("Crash on startup")).toBeInTheDocument();
      await new Promise(resolve => setTimeout(resolve, 350));
      expect(searchIssues).not.toHaveBeenCalled();
    });
  });

  describe("item tab", () => {
    it("shows the landing tab until an item is opened", async () => {
      const user = userEvent.setup();
      const app = renderApp();

      expect(await screen.findByText("Select an issue or pull request")).toBeInTheDocument();
      expect(tab("Select an issue")).toBeInTheDocument();

      // The landing tab and the navigator header both offer it; the last one is the landing tab's.
      await user.click(screen.getAllByRole("button", { name: /New issue/ }).at(-1)!);
      expect(app.location().pathname).toBe("/github/octo/repo/issues/new");
    });

    it("renders an issue with its comments, names its tab and posts a comment", async () => {
      const user = userEvent.setup();
      renderApp(ISSUE_URL);

      expect(await screen.findByText("crashes")).toBeInTheDocument();
      expect(screen.getByText("Same here")).toBeInTheDocument();
      await waitFor(() => expect(tab(/#1 Crash on startup/)).toBeInTheDocument());

      await user.type(screen.getByLabelText("Comment"), "On it");
      await waitFor(() => expect(hasBadge("Unsent comment")).toBe(true));

      await user.click(screen.getByRole("button", { name: /^Comment$/ }));
      await waitFor(() => expect(addIssueComment).toHaveBeenCalledWith({ owner: "octo", repo: "repo", issueNumber: 1, body: "On it" }));
      await waitFor(() => expect(hasBadge("Unsent comment")).toBe(false));
      expect(mutateList).toHaveBeenCalled();
    });

    it("closes and relabels an issue", async () => {
      const user = userEvent.setup();
      renderApp(ISSUE_URL);

      await user.click(await screen.findByRole("button", { name: /Close issue/ }));
      await user.click(screen.getByRole("menuitem", { name: "Close as completed" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Close as completed" }));
      await waitFor(() => expect(updateIssue).toHaveBeenCalledWith({ owner: "octo", repo: "repo", issueNumber: 1, state: "closed", stateReason: "completed" }));

      await user.click(screen.getByRole("button", { name: "Edit labels" }));
      await user.click(screen.getByRole("menuitemcheckbox", { name: /docs/ }));
      await waitFor(() => expect(addLabels).toHaveBeenCalledWith({ owner: "octo", repo: "repo", issueNumber: 1, labels: ["docs"] }));

      await user.click(screen.getByRole("button", { name: "Remove label bug" }));
      await waitFor(() => expect(removeLabel).toHaveBeenCalledWith({ owner: "octo", repo: "repo", issueNumber: 1, label: "bug" }));
    });

    it("asks before closing an issue and can close it as not planned", async () => {
      const user = userEvent.setup();
      renderApp(ISSUE_URL);

      await user.click(await screen.findByRole("button", { name: /Close issue/ }));
      await user.click(screen.getByRole("menuitem", { name: "Close as not planned" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep open" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(updateIssue).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: /Close issue/ }));
      await user.click(screen.getByRole("menuitem", { name: "Close as not planned" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Close as not planned" }));
      await waitFor(() =>
        expect(updateIssue).toHaveBeenCalledWith({ owner: "octo", repo: "repo", issueNumber: 1, state: "closed", stateReason: "not_planned" }),
      );
    });

    it("says when only the first page of comments is shown", async () => {
      state.issues = [{ ...issueOne, comments: 250 }, issueTwo];
      renderApp(ISSUE_URL);

      expect(await screen.findByText("First 1 of 250 comments")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Read the rest on GitHub/ })).toHaveAttribute("href", issueOne.html_url);
    });

    it("saves edited title, body and assignees", async () => {
      const user = userEvent.setup();
      renderApp(ISSUE_URL);

      await user.click(await screen.findByRole("button", { name: "Edit" }));
      const title = screen.getByLabelText("Title");
      await user.clear(title);
      await user.type(title, "Crash on launch");
      await user.clear(screen.getByLabelText(/Assignees/));
      await user.click(screen.getByRole("button", { name: /Save/ }));

      await waitFor(() => expect(updateIssue).toHaveBeenCalled());
      expect(updateIssue.mock.calls[0]![0]).toEqual({ owner: "octo", repo: "repo", issueNumber: 1, title: "Crash on launch", assignees: [] });
    });

    it("hands an issue to a new agent and opens its chat with a prefilled prompt", async () => {
      const user = userEvent.setup();
      renderApp(ISSUE_URL);

      await user.click(await screen.findByRole("button", { name: /Work with agent/ }));
      await waitFor(() => expect(createAgent).toHaveBeenCalledWith({ agentType: "code", headless: false }));
      await waitFor(() => expect(tab(/agent-new/)).toBeInTheDocument());
      const inputs = JSON.parse(localStorage.getItem("tokenring-chat-inputs") ?? "{}") as Record<string, string>;
      expect(inputs["agent-new"]).toContain("octo/repo#1");
      expect(inputs["agent-new"]).toContain("Crash on startup");
    });

    it("offers to close the tab when the issue is gone", async () => {
      const user = userEvent.setup();
      renderApp("/github/octo/repo/issues/99");

      expect(await screen.findByText("Issue #99 could not be loaded")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close panel" }));
      await waitFor(() => expect(tab(/Issue #99/)).not.toBeInTheDocument());
    });

    it("renders a pull request with files and checks, and submits a review", async () => {
      const user = userEvent.setup();
      renderApp(PULL_URL);

      expect(await screen.findByText("Adds the flag.")).toBeInTheDocument();
      await waitFor(() => expect(tab("#7 Add feature flag")).toBeInTheDocument());
      expect(screen.getByText("octo:feature")).toBeInTheDocument();
      // mergeable_state is shown in words, not GitHub's code.
      expect(within(screen.getByRole("region", { name: "Merge" })).getByText("ready to merge")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Files/ }));
      expect(await screen.findByText("src/flag.ts")).toBeInTheDocument();
      expect(screen.getByText("more")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Checks/ }));
      expect(await screen.findByText("ci / test")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Review" }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByLabelText(/Approve/));
      await user.type(within(dialog).getByLabelText(/Summary/), "Ship it");
      await user.click(within(dialog).getByRole("button", { name: "Submit review" }));

      await waitFor(() => expect(reviewPullRequest).toHaveBeenCalledWith({ owner: "octo", repo: "repo", prNumber: 7, event: "APPROVE", body: "Ship it" }));
    });

    it("closes a pull request and requests reviewers", async () => {
      const user = userEvent.setup();
      renderApp(PULL_URL);

      await user.click(await screen.findByRole("button", { name: "Request reviewers" }));
      await user.type(screen.getByLabelText("Reviewers"), "hubot, @monalisa{Enter}");
      await waitFor(() => expect(addPRReviewers).toHaveBeenCalledWith({ owner: "octo", repo: "repo", prNumber: 7, reviewers: ["hubot", "monalisa"] }));

      await user.click(screen.getByRole("button", { name: /^Close$/ }));
      const dialog = await screen.findByRole("dialog");
      expect(closePullRequest).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: "Close pull request" }));
      await waitFor(() => expect(closePullRequest).toHaveBeenCalledWith({ owner: "octo", repo: "repo", prNumber: 7 }));
    });
  });

  describe("pull request actions", () => {
    it("merges with the chosen method after confirming, pinned to the head it showed", async () => {
      const user = userEvent.setup();
      renderApp(PULL_URL);

      const merge = await screen.findByRole("region", { name: "Merge" });
      await user.selectOptions(within(merge).getByLabelText("Merge method"), "squash");
      await user.click(within(merge).getByRole("button", { name: "Squash and merge" }));

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("octo:feature into main");
      expect(within(dialog).queryByText(/Don't ask again/i)).not.toBeInTheDocument();
      expect(mergePullRequest).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: "Squash and merge" }));

      await waitFor(() => expect(mergePullRequest).toHaveBeenCalledWith({ owner: "octo", repo: "repo", prNumber: 7, method: "squash", sha: "abc1234" }));
      // The choice is remembered for the next pull request.
      expect(JSON.parse(localStorage.getItem("github:merge-method") ?? "null")).toBe("squash");
    });

    it("does not offer to merge a conflicted pull request but can queue auto-merge", async () => {
      const user = userEvent.setup();
      state.pulls = [
        { ...pullSeven, mergeable_state: "blocked" },
        { ...pullSeven, number: 8, mergeable_state: "dirty" },
      ];
      const { unmount } = renderApp("/github/octo/repo/pulls/8");
      const conflicted = await screen.findByRole("region", { name: "Merge" });
      expect(within(conflicted).getByText("has merge conflicts")).toBeInTheDocument();
      expect(within(conflicted).getByRole("button", { name: "Merge" })).toBeDisabled();
      unmount();

      renderApp(PULL_URL);
      const blocked = await screen.findByRole("region", { name: "Merge" });
      await user.click(within(blocked).getByRole("button", { name: "Enable auto-merge" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Enable auto-merge" }));
      await waitFor(() => expect(setAutoMerge).toHaveBeenCalledWith({ owner: "octo", repo: "repo", prNumber: 7, enabled: true, method: "merge" }));
    });

    it("shows who enabled auto-merge and turns it off", async () => {
      const user = userEvent.setup();
      state.pulls = [
        {
          ...pullSeven,
          mergeable_state: "blocked",
          auto_merge: { enabled_by: octocat, merge_method: "squash", commit_title: "", commit_message: "" },
        } as typeof pullSeven,
      ];
      renderApp(PULL_URL);

      expect(await screen.findByText("Auto-merge (squash) enabled by octocat")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Disable auto-merge" }));
      await waitFor(() => expect(setAutoMerge).toHaveBeenCalledWith({ owner: "octo", repo: "repo", prNumber: 7, enabled: false }));
    });

    it("edits the title and description, changes labels, and lists requested reviewers", async () => {
      const user = userEvent.setup();
      const hubot = { ...octocat, login: "hubot", id: 2 };
      state.pulls = [
        {
          ...pullSeven,
          requested_reviewers: [hubot],
          requested_teams: [{ id: 1, name: "Core", slug: "core", description: null, html_url: "https://github.com/orgs/octo/teams/core" }],
        } as typeof pullSeven,
      ];
      renderApp(PULL_URL);

      const reviewers = await screen.findByLabelText("Requested reviewers");
      expect(reviewers).toHaveTextContent("hubot");
      expect(reviewers).toHaveTextContent("@octo/core");

      await user.click(screen.getByRole("button", { name: "Edit" }));
      const title = screen.getByLabelText("Pull request title");
      await user.clear(title);
      await user.type(title, "Add feature flags");
      await waitFor(() => expect(hasBadge("Unsaved edits")).toBe(true));
      await user.type(screen.getByLabelText("Pull request description"), " Also docs.");
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(updatePullRequest).toHaveBeenCalledWith({
          owner: "octo",
          repo: "repo",
          prNumber: 7,
          title: "Add feature flags",
          body: "Adds the flag. Also docs.",
        }),
      );

      await user.click(screen.getByRole("button", { name: "Edit labels" }));
      await user.click(await screen.findByRole("menuitemcheckbox", { name: /bug/ }));
      await waitFor(() => expect(addLabels).toHaveBeenCalledWith({ owner: "octo", repo: "repo", issueNumber: 7, labels: ["bug"] }));
    });
  });

  describe("create form", () => {
    it("creates an issue, then closes itself and opens the new issue", async () => {
      const user = userEvent.setup();
      const app = renderApp("/github/octo/repo/issues/new");

      await user.type(await screen.findByLabelText("Title"), "Add dark mode");
      await user.type(screen.getByLabelText(/Description/), "Please.");
      await user.click(within(screen.getByRole("group", { name: "Labels" })).getByRole("button", { name: /bug/ }));
      await user.type(screen.getByLabelText(/Assignees/), "octocat");
      await user.click(screen.getByRole("button", { name: /Create issue/ }));

      await waitFor(() => expect(createIssue).toHaveBeenCalled());
      expect(createIssue.mock.calls[0]![0]).toEqual({
        owner: "octo",
        repo: "repo",
        title: "Add dark mode",
        body: "Please.",
        labels: ["bug"],
        assignees: ["octocat"],
      });
      await waitFor(() => expect(tab(/New issue · repo/)).not.toBeInTheDocument());
      await waitFor(() => expect(app.location().pathname).toBe("/github/octo/repo/issues/3"));
      expect(await screen.findByRole("tab", { name: /#3|Issue #3/ })).toBeInTheDocument();
    });
  });

  describe("create form discard", () => {
    it("asks before Discard throws away a draft", async () => {
      const user = userEvent.setup();
      renderApp("/github/acme/api/issues/new");
      await user.type(await screen.findByLabelText("Title"), "Half written");

      await user.click(screen.getByRole("button", { name: "Discard" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep draft" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(tab(/New issue · api/)).toBeInTheDocument();
      expect(screen.getByLabelText("Title")).toHaveValue("Half written");

      await user.click(screen.getByRole("button", { name: "Discard" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard draft" }));
      await waitFor(() => expect(tab(/New issue · api/)).not.toBeInTheDocument());
      expect(JSON.parse(localStorage.getItem("github:new-issue:acme/api") ?? "{}")).toMatchObject({ title: "" });
    });

    it("discards an empty form without asking", async () => {
      const user = userEvent.setup();
      renderApp("/github/acme/api/issues/new");
      await user.click(await screen.findByRole("button", { name: "Discard" }));
      await waitFor(() => expect(tab(/New issue · api/)).not.toBeInTheDocument());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("create form deep links", () => {
    it("files into the repository named by its URL, not the saved selection", async () => {
      const user = userEvent.setup();
      localStorage.setItem("github:repo", JSON.stringify("octo/repo"));
      renderApp("/github/acme/api/issues/new");

      expect((await screen.findAllByText("acme/api")).length).toBeGreaterThan(0);
      await user.type(await screen.findByLabelText("Title"), "Deep linked");
      await user.click(screen.getByRole("button", { name: /Create issue/ }));

      await waitFor(() => expect(createIssue).toHaveBeenCalled());
      expect(createIssue.mock.calls[0]![0]).toMatchObject({ owner: "acme", repo: "api", title: "Deep linked" });
    });

    it("keeps a draft per repository and badges the tab while it is dirty", async () => {
      const user = userEvent.setup();
      const first = renderApp("/github/acme/api/issues/new");
      await user.type(await screen.findByLabelText("Title"), "Half written");
      await waitFor(() => expect(hasBadge("Unsaved issue draft")).toBe(true));
      expect(JSON.parse(localStorage.getItem("github:new-issue:acme/api") ?? "{}")).toMatchObject({ title: "Half written" });
      first.unmount();

      const second = renderApp("/github/octo/repo/issues/new");
      expect(await screen.findByLabelText("Title")).toHaveValue("");
      expect(hasBadge("Unsaved issue draft")).toBe(false);
      second.unmount();

      renderApp("/github/acme/api/issues/new");
      expect(await screen.findByLabelText("Title")).toHaveValue("Half written");
    });
  });

  describe("new pull request form", () => {
    it("opens a draft pull request from the picked branches, then opens it", async () => {
      const user = userEvent.setup();
      const app = renderApp("/github/octo/repo/pulls/new");

      // The base defaults to the repository's default branch.
      await waitFor(() => expect(screen.getByLabelText("Base (merge into)")).toHaveValue("main"));
      await user.selectOptions(screen.getByLabelText("Head (merge from)"), "main");
      expect(screen.getByRole("alert")).toHaveTextContent("same branch");
      await user.selectOptions(screen.getByLabelText("Head (merge from)"), "feature");
      await user.type(screen.getByLabelText("Title"), "Add feature");
      await user.type(screen.getByLabelText(/Description/), "Body text");
      await waitFor(() => expect(hasBadge("Unsaved pull request draft")).toBe(true));
      await user.click(screen.getByLabelText(/Open as a draft/));
      await user.click(screen.getByRole("button", { name: /Open draft pull request/ }));

      await waitFor(() => expect(createPullRequest).toHaveBeenCalled());
      expect(createPullRequest.mock.calls[0]![0]).toEqual({
        owner: "octo",
        repo: "repo",
        title: "Add feature",
        head: "feature",
        base: "main",
        body: "Body text",
        draft: true,
      });
      await waitFor(() => expect(tab(/New PR · repo/)).not.toBeInTheDocument());
      await waitFor(() => expect(app.location().pathname).toBe("/github/octo/repo/pulls/8"));
      expect(JSON.parse(localStorage.getItem("github:new-pull:octo/repo") ?? "{}")).toMatchObject({ title: "", head: "" });
    });

    it("asks before discarding a draft and lets branch names be typed", async () => {
      const user = userEvent.setup();
      renderApp("/github/acme/api/pulls/new");

      await user.click(await screen.findByLabelText(/Type branch names/));
      await user.type(screen.getByLabelText("Head (merge from)"), "fork:topic");
      await user.click(screen.getByRole("button", { name: "Discard" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep draft" }));
      expect(tab(/New PR · api/)).toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem("github:new-pull:acme/api") ?? "{}")).toMatchObject({ head: "fork:topic" });

      await user.click(screen.getByRole("button", { name: "Discard" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard draft" }));
      await waitFor(() => expect(tab(/New PR · api/)).not.toBeInTheDocument());
    });
  });

  describe("accounts", () => {
    it("starts the OAuth flow and opens GitHub in a new tab", async () => {
      const user = userEvent.setup();
      const open = mock(() => null);
      window.open = open as unknown as typeof window.open;
      state.accounts = [{ ...state.accounts[0]!, isAuthenticated: false, profile: { login: "octocat" } }];
      renderApp("/github/accounts");

      await user.click(await screen.findByRole("button", { name: "Connect" }));
      await waitFor(() => expect(beginAuthorization).toHaveBeenCalledWith({ account: "work" }));
      await waitFor(() => expect(open).toHaveBeenCalledWith("https://github.com/login/oauth/authorize?state=x", "_blank", "noopener,noreferrer"));
    });

    it("disconnects after confirmation", async () => {
      const user = userEvent.setup();
      renderApp("/github/accounts");

      await user.click(await screen.findByRole("button", { name: /Disconnect/ }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));
      await waitFor(() => expect(revokeAuthorization).toHaveBeenCalledWith({ account: "work" }));
    });

    it("explains token and OAuth setup in plain language instead of environment variables", async () => {
      state.hasOAuthClient = false;
      state.accounts = [{ ...state.accounts[0]!, isAuthenticated: false }];
      renderApp("/github/accounts");

      expect(await screen.findByText(/paste a personal access token into this account/)).toBeInTheDocument();
      expect(screen.getByText(/Personal access token \(simplest\)/)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain("GITHUB_CLIENT_ID");
    });

    it("links an empty account list to the GitHub configuration", async () => {
      const user = userEvent.setup();
      state.accounts = [];
      renderApp("/github/accounts");

      expect(await screen.findByText(/Sign in with GitHub \(OAuth\)/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Open GitHub configuration" }));
      await waitFor(() => expect(screen.queryByText("No GitHub accounts configured")).not.toBeInTheDocument());
    });
  });
});
