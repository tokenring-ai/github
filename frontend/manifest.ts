import type { ViewManifest } from "@tokenring-ai/one-frontend/dock/types.ts";
import type { PluginFrontendManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { CircleDot, FilePlus, GitPullRequest, GitPullRequestCreate, KeyRound, List } from "lucide-react";

export const GITHUB_NAVIGATOR_VIEW = "github-navigator";
export const GITHUB_ITEM_VIEW = "github-item";
export const GITHUB_ISSUE_CREATE_VIEW = "github-issue-create";
export const GITHUB_PULL_CREATE_VIEW = "github-pull-create";
export const GITHUB_ACCOUNTS_VIEW = "github-accounts";

export const GITHUB_DASHBOARD_ID = "github";

/** Navigator: repository and account pickers, issue / pull request lists, agent sessions. */
export const githubNavigatorViewManifest = {
  id: GITHUB_NAVIGATOR_VIEW,
  title: "Issues & PRs",
  description: "Issues and pull requests of the selected repository",
  icon: List,
  availableOn: ["any"],
  defaultSize: { width: 320, height: 420 },
  minimumSize: { width: 260, height: 160 },
  tags: ["github", "code"],
} satisfies ViewManifest;

/** One issue or pull request per panel. Without a number it is the main area's placeholder. */
export const githubItemViewManifest = {
  id: GITHUB_ITEM_VIEW,
  title: "Issue",
  description: "Read, discuss and act on one issue or pull request",
  icon: CircleDot,
  availableOn: [],
  instanceable: true,
  renderer: "always",
  minimumSize: { width: 380, height: 240 },
  tags: ["github"],
} satisfies ViewManifest;

/** New-issue form; closes itself and opens the issue it created. */
export const githubIssueCreateViewManifest = {
  id: GITHUB_ISSUE_CREATE_VIEW,
  title: "New issue",
  description: "Open an issue on the selected repository",
  icon: FilePlus,
  availableOn: [],
  instanceable: true,
  minimumSize: { width: 380, height: 240 },
  tags: ["github"],
} satisfies ViewManifest;

/** New-pull-request form; closes itself and opens the pull request it created. */
export const githubPullCreateViewManifest = {
  id: GITHUB_PULL_CREATE_VIEW,
  title: "New pull request",
  description: "Open a pull request on the selected repository",
  icon: GitPullRequestCreate,
  availableOn: [],
  instanceable: true,
  minimumSize: { width: 380, height: 240 },
  tags: ["github"],
} satisfies ViewManifest;

/** Connected GitHub accounts, with OAuth sign-in and sign-out. */
export const githubAccountsViewManifest = {
  id: GITHUB_ACCOUNTS_VIEW,
  title: "GitHub accounts",
  description: "Connect and disconnect the GitHub accounts TokenRing acts as",
  icon: KeyRound,
  availableOn: ["any"],
  defaultSize: { width: 420, height: 360 },
  minimumSize: { width: 300, height: 200 },
  tags: ["github", "accounts"],
} satisfies ViewManifest;

/** Views that act as the GitHub dashboard's navigator; item panels never tab into their group. */
export const GITHUB_SIDEBAR_VIEWS: readonly string[] = [GITHUB_NAVIGATOR_VIEW];

export default {
  id: GITHUB_DASHBOARD_ID,
  path: "/github",
  label: "GitHub",
  shortLabel: "GH",
  description: "Browse and act on issues and pull requests",
  group: "Build",
  icon: GitPullRequest,
  iconClass: "text-slate-600 dark:text-slate-300",
  gradient: "from-slate-600 to-slate-900",
  views: [githubNavigatorViewManifest, githubItemViewManifest, githubIssueCreateViewManifest, githubPullCreateViewManifest, githubAccountsViewManifest],
} satisfies PluginFrontendManifest;
