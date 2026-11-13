import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import type { PluginLayoutViews } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { CircleDot, FilePlus, GitPullRequestCreate, KeyRound, List } from "lucide-react";
import { lazy } from "react";
import {
  GITHUB_ACCOUNTS_VIEW_ID,
  GITHUB_ISSUE_CREATE_VIEW_ID,
  GITHUB_ITEM_VIEW_ID,
  GITHUB_NAVIGATOR_VIEW_ID,
  GITHUB_PULL_CREATE_VIEW_ID,
  GITHUB_START_VIEW_ID,
  GITHUB_VIEW_KIND,
} from "./ids.ts";

const GitHubNavigatorPane = lazy(() => import("./panes/GitHubNavigatorPane.tsx"));
const GitHubStartPane = lazy(() => import("./panes/GitHubStartPane.tsx"));
const GitHubItemPane = lazy(() => import("./panes/GitHubItemPane.tsx"));
const GitHubIssueCreatePane = lazy(() => import("./panes/GitHubIssueCreatePane.tsx"));
const GitHubPullCreatePane = lazy(() => import("./panes/GitHubPullCreatePane.tsx"));
const GitHubAccountsPane = lazy(() => import("./panes/GitHubAccountsPane.tsx"));

/** One form (and draft) per repository; `selected` when a panel was opened without a repository. */
const repoInstanceKey = (params: Record<string, string>) => (params.owner && params.repo ? `${params.owner}/${params.repo}` : "selected");

export default {
  views: [
    // Navigator: repository and account pickers, issue / pull request lists, agent sessions.
    defineView({
      id: GITHUB_NAVIGATOR_VIEW_ID,
      kind: "navigator",
      title: "Issues & PRs",
      description: "Issues and pull requests of the selected repository",
      icon: List,
      closable: false,
      component: GitHubNavigatorPane,
    }),
    // `/github` and `/github/<owner>/<repo>`: the "Select an issue" landing tab; closes once an item is opened.
    defineView({
      id: GITHUB_START_VIEW_ID,
      landing: true,
      kind: GITHUB_VIEW_KIND,
      title: "Select an issue",
      description: "Pick an issue or pull request from the list to read it, or file a new issue",
      icon: CircleDot,
      route: ":owner?/:repo?",
      instanceKey: () => "",
      component: GitHubStartPane,
    }),
    // One issue or pull request per tab.
    defineView({
      id: GITHUB_ITEM_VIEW_ID,
      kind: GITHUB_VIEW_KIND,
      title: params => `${params.kind === "pulls" ? "PR" : "Issue"} #${params.number ?? ""}`,
      description: "Read, discuss and act on one issue or pull request",
      icon: CircleDot,
      route: ":owner/:repo/:kind/:number",
      instanceKey: params => `${params.owner}/${params.repo}/${params.kind}/${params.number}`,
      component: GitHubItemPane,
    }),
    // New-issue form; closes itself and opens the issue it created.
    defineView({
      id: GITHUB_ISSUE_CREATE_VIEW_ID,
      kind: GITHUB_VIEW_KIND,
      title: params => (params.owner && params.repo ? `New issue · ${params.repo}` : "New issue"),
      description: "Open an issue on the selected repository",
      icon: FilePlus,
      route: ":owner/:repo/issues/new",
      instanceKey: repoInstanceKey,
      component: GitHubIssueCreatePane,
    }),
    // New-pull-request form; closes itself and opens the pull request it created.
    defineView({
      id: GITHUB_PULL_CREATE_VIEW_ID,
      kind: GITHUB_VIEW_KIND,
      title: params => (params.owner && params.repo ? `New PR · ${params.repo}` : "New pull request"),
      description: "Open a pull request on the selected repository",
      icon: GitPullRequestCreate,
      route: ":owner/:repo/pulls/new",
      instanceKey: repoInstanceKey,
      component: GitHubPullCreatePane,
    }),
    // Connected GitHub accounts, with OAuth sign-in and sign-out.
    defineView({
      id: GITHUB_ACCOUNTS_VIEW_ID,
      kind: GITHUB_VIEW_KIND,
      title: "GitHub accounts",
      description: "Connect and disconnect the GitHub accounts TokenRing acts as",
      icon: KeyRound,
      route: "accounts",
      instanceKey: () => "",
      component: GitHubAccountsPane,
    }),
  ],
} satisfies PluginLayoutViews;
