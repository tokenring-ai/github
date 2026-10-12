import { openInMainArea } from "@tokenring-ai/one-frontend/dock/layout/mainArea.ts";
import type { PluginFrontendContribution } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { lazy } from "react";
import { z } from "zod";
import { adoptRouteRepo } from "./lib/githubStore.ts";
import { ACCOUNTS_PATH, ACCOUNTS_SEGMENT, GITHUB_PATH, itemPath, kindFromSegment, NEW_ISSUE_SEGMENT, newIssuePath, newPullPath } from "./lib/paths.ts";
import manifest, {
  GITHUB_ACCOUNTS_VIEW,
  GITHUB_ISSUE_CREATE_VIEW,
  GITHUB_ITEM_VIEW,
  GITHUB_PULL_CREATE_VIEW,
  GITHUB_SIDEBAR_VIEWS,
  githubAccountsViewManifest,
  githubIssueCreateViewManifest,
  githubItemViewManifest,
  githubNavigatorViewManifest,
  githubPullCreateViewManifest,
} from "./manifest.ts";

export const GitHubItemParams = z.object({
  owner: z.string().min(1).optional(),
  repo: z.string().min(1).optional(),
  kind: z.enum(["issue", "pull"]).optional(),
  /** Omitted for the placeholder panel that the next opened item fills. */
  number: z.number().int().positive().optional(),
});
export type GitHubItemParams = z.infer<typeof GitHubItemParams>;

/**
 * The repository a new-issue form files into. Instanceable per repository so
 * each one keeps its own draft; without params (a layout saved before the
 * form had them) it falls back to the selected repository.
 */
export const GitHubIssueCreateParams = z.object({
  owner: z.string().min(1).optional(),
  repo: z.string().min(1).optional(),
});
export type GitHubIssueCreateParams = z.infer<typeof GitHubIssueCreateParams>;

/** The repository a new-pull-request form opens against; one form (and draft) per repository. */
export const GitHubPullCreateParams = z.object({
  owner: z.string().min(1).optional(),
  repo: z.string().min(1).optional(),
});
export type GitHubPullCreateParams = z.infer<typeof GitHubPullCreateParams>;

function itemTitle(params: GitHubItemParams): string {
  if (!params.number) return "Select an issue";
  return `${params.kind === "pull" ? "PR" : "Issue"} #${params.number}`;
}

export default {
  ...manifest,
  views: [
    { ...githubNavigatorViewManifest, component: lazy(() => import("./views/GitHubNavigatorView.tsx")) },
    {
      ...githubItemViewManifest,
      params: GitHubItemParams,
      instanceKey: params => (params.number ? `${params.owner}/${params.repo}/${params.kind}/${params.number}` : "new"),
      titleFor: itemTitle,
      component: lazy(() => import("./views/GitHubItemView.tsx")),
    },
    {
      ...githubIssueCreateViewManifest,
      params: GitHubIssueCreateParams,
      instanceKey: params => (params.owner && params.repo ? `${params.owner}/${params.repo}` : "selected"),
      titleFor: params => (params.owner && params.repo ? `New issue · ${params.repo}` : "New issue"),
      component: lazy(() => import("./views/GitHubIssueCreateView.tsx")),
    },
    {
      ...githubPullCreateViewManifest,
      params: GitHubPullCreateParams,
      instanceKey: params => (params.owner && params.repo ? `${params.owner}/${params.repo}` : "selected"),
      titleFor: params => (params.owner && params.repo ? `New PR · ${params.repo}` : "New pull request"),
      component: lazy(() => import("./views/GitHubPullCreateView.tsx")),
    },
    { ...githubAccountsViewManifest, component: lazy(() => import("./views/GitHubAccountsView.tsx")) },
  ],
  dashboards: [
    {
      ...manifest,
      routePath: `${GITHUB_PATH}/:owner?/:repo?/:kind?/:number?`,
      defaultLayout: {
        kind: "row",
        sizes: [1, 3],
        children: [
          { kind: "panel", view: githubNavigatorViewManifest.id },
          { kind: "panel", view: githubItemViewManifest.id },
        ],
      },
      onNavigate({ params }, api) {
        const { owner, repo } = params;
        if (owner === ACCOUNTS_SEGMENT) {
          openInMainArea(api, GITHUB_ACCOUNTS_VIEW, undefined, { sidebarViews: GITHUB_SIDEBAR_VIEWS });
          return;
        }
        if (!owner || !repo) return;
        // The URL names the repository: make it the selected one so the navigator lists it.
        adoptRouteRepo(owner, repo);
        const kind = kindFromSegment(params.kind);
        if (!kind || !params.number) return;
        if (params.number === NEW_ISSUE_SEGMENT) {
          const view = kind === "issue" ? GITHUB_ISSUE_CREATE_VIEW : GITHUB_PULL_CREATE_VIEW;
          openInMainArea(api, view, { owner, repo }, { sidebarViews: GITHUB_SIDEBAR_VIEWS });
          return;
        }
        const number = Number(params.number);
        if (!Number.isInteger(number) || number <= 0) return;
        openInMainArea(api, GITHUB_ITEM_VIEW, { owner, repo, kind, number }, { sidebarViews: GITHUB_SIDEBAR_VIEWS, fillPlaceholder: true });
      },
      pathForActivePanel(panel, match) {
        switch (panel?.viewId) {
          case GITHUB_ITEM_VIEW: {
            const { owner, repo, kind, number } = panel.params;
            if (typeof owner === "string" && typeof repo === "string" && (kind === "issue" || kind === "pull") && typeof number === "number") {
              return itemPath(owner, repo, kind, number);
            }
            return null;
          }
          case GITHUB_ISSUE_CREATE_VIEW:
          case GITHUB_PULL_CREATE_VIEW: {
            const owner = typeof panel.params.owner === "string" ? panel.params.owner : match.params.owner;
            const repo = typeof panel.params.repo === "string" ? panel.params.repo : match.params.repo;
            if (!owner || !repo || owner === ACCOUNTS_SEGMENT) return null;
            return panel.viewId === GITHUB_PULL_CREATE_VIEW ? newPullPath(owner, repo) : newIssuePath(owner, repo);
          }
          case GITHUB_ACCOUNTS_VIEW:
            return ACCOUNTS_PATH;
          default:
            return null;
        }
      },
      documentTitle: ({ params }) => {
        if (params.owner === ACCOUNTS_SEGMENT) return "Accounts · GitHub";
        if (!params.owner || !params.repo) return "GitHub";
        const slug = `${params.owner}/${params.repo}`;
        if (params.number === NEW_ISSUE_SEGMENT) return `${params.kind === "pulls" ? "New pull request" : "New issue"} · ${slug} · GitHub`;
        if (params.number) return `#${params.number} · ${slug} · GitHub`;
        return `${slug} · GitHub`;
      },
    },
  ],
} satisfies PluginFrontendContribution;
