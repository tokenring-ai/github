import { useLayoutApi } from "@tokenring-ai/one-frontend/layout/context.ts";
import { usePaneLink } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { GITHUB_ACCOUNTS_VIEW_ID, GITHUB_ISSUE_CREATE_VIEW_ID, GITHUB_ITEM_VIEW_ID, GITHUB_PULL_CREATE_VIEW_ID } from "../ids.ts";
import { useGitHubRepo } from "./githubStore.ts";
import { GITHUB_PATH, type GitHubItemKind, KIND_SEGMENTS, repoPath } from "./paths.ts";

/** Panels tied to one repository; they close when another repository is selected. */
const REPO_SCOPED_VIEWS: ReadonlySet<string> = new Set([GITHUB_ITEM_VIEW_ID, GITHUB_ISSUE_CREATE_VIEW_ID, GITHUB_PULL_CREATE_VIEW_ID]);

/**
 * Navigation between the GitHub views on the layout engine. Opening an item,
 * a form or the accounts page navigates to its URL (the engine opens and
 * focuses the tab). The "Select an issue" landing tab has done its job once an
 * item is open, so it closes.
 */
export function useGitHubLayoutNavigation() {
  const api = useLayoutApi();
  const open = usePaneLink();
  const navigate = useNavigate();
  const { repo, selectRepo: storeRepo } = useGitHubRepo();

  const openItem = useCallback(
    (kind: GitHubItemKind, number: number, target?: { owner: string; repo: string }) => {
      const owner = target?.owner ?? repo?.owner;
      const name = target?.repo ?? repo?.repo;
      if (!owner || !name) return;
      open(GITHUB_ITEM_VIEW_ID, { owner, repo: name, kind: KIND_SEGMENTS[kind], number: String(number) });
    },
    [open, repo],
  );

  const openNewIssue = useCallback(() => {
    if (repo) open(GITHUB_ISSUE_CREATE_VIEW_ID, { owner: repo.owner, repo: repo.repo });
  }, [open, repo]);

  const openNewPull = useCallback(() => {
    if (repo) open(GITHUB_PULL_CREATE_VIEW_ID, { owner: repo.owner, repo: repo.repo });
  }, [open, repo]);

  const openAccounts = useCallback(() => open(GITHUB_ACCOUNTS_VIEW_ID), [open]);

  /** Switches repositories: items of the previous one are meaningless, so their panels close. */
  const selectRepo = useCallback(
    (owner: string, name: string) => {
      storeRepo(owner, name);
      for (const panel of Object.values(api.store.getState().panels)) {
        const otherRepo = panel.params.owner !== owner || panel.params.repo !== name;
        // New-issue and new-PR drafts are persisted per repository, so closing the form loses nothing.
        if (REPO_SCOPED_VIEWS.has(panel.viewId) && otherRepo) api.close(panel.key);
      }
      void navigate(repoPath(owner, name), { replace: true });
    },
    [api, navigate, storeRepo],
  );

  /** Opens (or focuses) the chat panel for an agent without leaving the app. */
  const openAgentChat = useCallback((agentId: string) => open("chat", { agentId }, { beside: { edge: "right" } }), [open]);

  const goHome = useCallback(() => void navigate(GITHUB_PATH, { replace: true }), [navigate]);

  return { openItem, openNewIssue, openNewPull, openAccounts, selectRepo, openAgentChat, goHome };
}
