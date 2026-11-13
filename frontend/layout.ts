import type { PluginLayoutManifest } from "@tokenring-ai/one-frontend/plugins/layoutTypes.ts";
import { GitPullRequest } from "lucide-react";
import {
  GITHUB_ACCOUNTS_VIEW_ID,
  GITHUB_APP_ID,
  GITHUB_APP_PATH,
  GITHUB_ISSUE_CREATE_VIEW_ID,
  GITHUB_ITEM_VIEW_ID,
  GITHUB_NAVIGATOR_VIEW_ID,
  GITHUB_PULL_CREATE_VIEW_ID,
  GITHUB_START_VIEW_ID,
  GITHUB_VIEW_KIND,
} from "./ids.ts";

/**
 * GitHub: the issue / pull request navigator (with the attached GitHub agent)
 * on the left; one tab per open item, new-issue / new-PR form and the accounts
 * page on the right, and the agent's chat beside them. Routes: `/github`,
 * `/github/<owner>/<repo>`, `/github/<owner>/<repo>/(issues|pulls)/<number>`,
 * `/github/<owner>/<repo>/(issues|pulls)/new`, `/github/accounts`.
 */
export const GITHUB_APP = {
  id: GITHUB_APP_ID,
  path: GITHUB_APP_PATH,
  label: "GitHub",
  shortLabel: "GH",
  description: "Browse and act on issues and pull requests",
  group: "Build",
  icon: GitPullRequest,
  iconClass: "text-slate-600 dark:text-slate-300",
  gradient: "from-slate-600 to-slate-900",
  views: [
    GITHUB_NAVIGATOR_VIEW_ID,
    GITHUB_START_VIEW_ID,
    GITHUB_ITEM_VIEW_ID,
    GITHUB_ISSUE_CREATE_VIEW_ID,
    GITHUB_PULL_CREATE_VIEW_ID,
    GITHUB_ACCOUNTS_VIEW_ID,
    "chat",
  ],
  primaryKind: GITHUB_VIEW_KIND,
  placement: { agent: "right" },
  layout: {
    split: "row",
    sizes: [1, 3],
    children: [
      { presenter: "single", accepts: ["navigator"], items: [GITHUB_NAVIGATOR_VIEW_ID] },
      { presenter: "tabs", accepts: [GITHUB_VIEW_KIND], items: [GITHUB_START_VIEW_ID], primary: true },
    ],
  },
} satisfies PluginLayoutManifest["apps"][number];

export default {
  apps: [GITHUB_APP],
  kinds: [{ id: GITHUB_VIEW_KIND, label: "GitHub", plural: "GitHub tabs" }],
} satisfies PluginLayoutManifest;
