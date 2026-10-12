import { prefillChatInput } from "@tokenring-ai/one-frontend/components/ChatInputContext.tsx";
import { useDashboardApi } from "@tokenring-ai/one-frontend/dock/DashboardApiContext.tsx";
import { openInMainArea } from "@tokenring-ai/one-frontend/dock/layout/mainArea.ts";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  GITHUB_ACCOUNTS_VIEW,
  GITHUB_DASHBOARD_ID,
  GITHUB_ISSUE_CREATE_VIEW,
  GITHUB_ITEM_VIEW,
  GITHUB_PULL_CREATE_VIEW,
  GITHUB_SIDEBAR_VIEWS,
} from "../manifest.ts";
import { useGitHubRepo } from "./githubStore.ts";
import { ACCOUNTS_PATH, GITHUB_PATH, type GitHubItemKind, itemPath, newIssuePath, newPullPath, repoPath } from "./paths.ts";

/**
 * Navigation between the GitHub views. Each action opens the target panel in
 * the main area right away (so a closed panel re-opens even when the URL does
 * not change) and then updates the URL. Rendered on another dashboard, the
 * hook only navigates.
 */
export function useGitHubNavigation() {
  const navigate = useNavigate();
  const dashboard = useDashboardApi();
  const { repo, selectRepo: storeRepo } = useGitHubRepo();
  const onDashboard = dashboard.dashboardId === GITHUB_DASHBOARD_ID;

  const openItem = useCallback(
    (kind: GitHubItemKind, number: number, target?: { owner: string; repo: string }) => {
      const owner = target?.owner ?? repo?.owner;
      const name = target?.repo ?? repo?.repo;
      if (!owner || !name) return;
      if (onDashboard) {
        openInMainArea(dashboard, GITHUB_ITEM_VIEW, { owner, repo: name, kind, number }, { sidebarViews: GITHUB_SIDEBAR_VIEWS, fillPlaceholder: true });
      }
      void navigate(itemPath(owner, name, kind, number));
    },
    [dashboard, navigate, onDashboard, repo],
  );

  const openNewIssue = useCallback(() => {
    if (!repo) return;
    if (onDashboard) {
      openInMainArea(dashboard, GITHUB_ISSUE_CREATE_VIEW, { owner: repo.owner, repo: repo.repo }, { sidebarViews: GITHUB_SIDEBAR_VIEWS });
    }
    void navigate(newIssuePath(repo.owner, repo.repo));
  }, [dashboard, navigate, onDashboard, repo]);

  const openNewPull = useCallback(() => {
    if (!repo) return;
    if (onDashboard) {
      openInMainArea(dashboard, GITHUB_PULL_CREATE_VIEW, { owner: repo.owner, repo: repo.repo }, { sidebarViews: GITHUB_SIDEBAR_VIEWS });
    }
    void navigate(newPullPath(repo.owner, repo.repo));
  }, [dashboard, navigate, onDashboard, repo]);

  const openAccounts = useCallback(() => {
    if (onDashboard) openInMainArea(dashboard, GITHUB_ACCOUNTS_VIEW, undefined, { sidebarViews: GITHUB_SIDEBAR_VIEWS });
    void navigate(ACCOUNTS_PATH);
  }, [dashboard, navigate, onDashboard]);

  /** Switches repositories: items of the previous one are meaningless, so their panels close. */
  const selectRepo = useCallback(
    (owner: string, name: string) => {
      storeRepo(owner, name);
      if (onDashboard) {
        for (const panel of dashboard.listPanels()) {
          const isItem = panel.viewId === GITHUB_ITEM_VIEW && typeof panel.params.number === "number";
          const isCreate = panel.viewId === GITHUB_ISSUE_CREATE_VIEW || panel.viewId === GITHUB_PULL_CREATE_VIEW;
          const otherRepo = panel.params.owner !== owner || panel.params.repo !== name;
          // New-issue and new-PR drafts are persisted per repository, so closing the form loses nothing.
          if ((isItem || isCreate) && otherRepo) dashboard.closeView(panel.panelId);
        }
      }
      void navigate(repoPath(owner, name), { replace: true });
    },
    [dashboard, navigate, onDashboard, storeRepo],
  );

  /** Opens (or focuses) the chat panel for an agent without leaving the dashboard. */
  const openAgentChat = useCallback(
    (agentId: string) => {
      if (onDashboard) dashboard.openView("chat", { agentId }, { position: "right" });
      else void navigate(`/agent/${agentId}`);
    },
    [dashboard, navigate, onDashboard],
  );

  const goHome = useCallback(() => void navigate(GITHUB_PATH, { replace: true }), [navigate]);

  return { openItem, openNewIssue, openNewPull, openAccounts, selectRepo, openAgentChat, goHome };
}

/**
 * The message an agent starts from when the user hands it an issue or pull
 * request. The agent has the github tools, so it fetches the details itself.
 */
export function agentPromptForItem(kind: GitHubItemKind, owner: string, repo: string, number: number, title: string): string {
  const noun = kind === "pull" ? "pull request" : "issue";
  const tool = kind === "pull" ? "github_getPR" : "github_getIssue";
  return [
    `Please look at GitHub ${noun} ${owner}/${repo}#${number}: "${title}".`,
    `Use ${tool} (with the comments) to read it, then summarize what it asks for and propose how to proceed.`,
  ].join("\n");
}

/** Puts the hand-off prompt into the agent's composer so the user can edit it before sending. */
export function handItemToAgent(agentId: string, kind: GitHubItemKind, owner: string, repo: string, number: number, title: string): void {
  prefillChatInput(agentId, agentPromptForItem(kind, owner, repo, number, title));
}
