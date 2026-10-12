import { readLocalStorageState, useLocalStorageState, writeLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import { type GitHubItemState, type GitHubRepoRef, useGitHubStatus, useGitHubWorkspaceRepository } from "@tokenring-ai/one-frontend/rpc.ts";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_LIST_QUERY, type GitHubListSort } from "./githubQueries.ts";
import type { GitHubItemKind } from "./paths.ts";
import { parseRepoSlug, repoSlug } from "./paths.ts";

/**
 * State the GitHub views share. Each view is its own React subtree, so the
 * selection lives in localStorage (instances of `useLocalStorageState` with
 * the same key stay in sync within the document) and unsent comment drafts in
 * a module store.
 */

/** `owner/repo` chosen in the navigator; null means "use the workspace's repository". */
export const GITHUB_REPO_KEY = "github:repo";
/** Recently opened `owner/repo` slugs, most recent first. */
export const GITHUB_RECENT_REPOS_KEY = "github:recent-repos";
/** Account the dashboard reads and writes as; null means the plugin's default. */
export const GITHUB_ACCOUNT_KEY = "github:account";
export const GITHUB_LIST_KIND_KEY = "github:list-kind";
export const GITHUB_LIST_STATE_KEY = "github:list-state";
/** Server-side list filters: one label, an assignee login (issues only), and the sort order. */
export const GITHUB_LIST_LABEL_KEY = "github:list-label";
export const GITHUB_LIST_ASSIGNEE_KEY = "github:list-assignee";
export const GITHUB_LIST_SORT_KEY = "github:list-sort";

const MAX_RECENT_REPOS = 10;

/** The stored repository selection, readable outside React (the dashboard's `onNavigate` needs it). */
export function readSelectedRepoSlug(): string | null {
  return readLocalStorageState<string | null>(GITHUB_REPO_KEY, null);
}

/**
 * Makes the route's repository the selected one. The URL is authoritative: a
 * deep link to `/github/acme/api/...` must show and act on acme/api, not
 * whatever repository was picked last. A no-op when it already is selected,
 * so `onNavigate` can call it on every URL change.
 */
export function adoptRouteRepo(owner: string, repo: string): void {
  const slug = repoSlug(owner, repo);
  if (!parseRepoSlug(slug) || readSelectedRepoSlug() === slug) return;
  writeLocalStorageState(GITHUB_REPO_KEY, slug);
  const stored = readLocalStorageState<unknown>(GITHUB_RECENT_REPOS_KEY, []);
  const recent = Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === "string") : [];
  writeLocalStorageState(GITHUB_RECENT_REPOS_KEY, [slug, ...recent.filter(entry => entry !== slug)].slice(0, MAX_RECENT_REPOS));
}

/** localStorage key of the unsent new-issue form for one repository. */
export function newIssueDraftKey(owner: string, repo: string): string {
  return `github:new-issue:${repoSlug(owner, repo)}`;
}

/** localStorage key of the unsent new-pull-request form for one repository. */
export function newPullDraftKey(owner: string, repo: string): string {
  return `github:new-pull:${repoSlug(owner, repo)}`;
}

export function readSelectedAccount(): string | null {
  return readLocalStorageState<string | null>(GITHUB_ACCOUNT_KEY, null);
}

/** Fallback matches GitHubConfigSchema.agentTypes so the agent list is usable before the RPC returns. */
const DEFAULT_AGENT_TYPES = ["code", "plan"];

export interface GitHubAccountSummary {
  name: string;
  login?: string | undefined;
  isAuthenticated: boolean;
}

export interface UseGitHubAccountResult {
  /** Account the dashboard acts as: the stored choice when it still exists, else the plugin's default. */
  account: string | null;
  accounts: GitHubAccountSummary[];
  /** Whether the account in use (or the default) can make authenticated calls. */
  isAuthenticated: boolean;
  hasOAuthClient: boolean;
  agentTypes: string[];
  setAccount: (account: string | null) => void;
  isLoading: boolean;
  error: unknown;
  refresh: () => void;
}

/** The configured accounts and which one the user picked. */
export function useGitHubAccount(): UseGitHubAccountResult {
  const status = useGitHubStatus();
  const [stored, setStored] = useLocalStorageState<string | null>(GITHUB_ACCOUNT_KEY, null);

  const accounts = useMemo<GitHubAccountSummary[]>(
    () => (status.data?.accounts ?? []).map(({ name, login, isAuthenticated }) => ({ name, login, isAuthenticated })),
    [status.data],
  );
  const account = stored && accounts.some(candidate => candidate.name === stored) ? stored : null;
  const effective = account ?? status.data?.defaultAccount ?? (accounts.length === 1 ? accounts[0]!.name : null);
  const agentTypes = status.data?.agentTypes ?? DEFAULT_AGENT_TYPES;

  return {
    account,
    accounts,
    isAuthenticated: accounts.some(candidate => candidate.name === effective && candidate.isAuthenticated),
    hasOAuthClient: status.data?.hasOAuthClient ?? false,
    agentTypes: agentTypes.length > 0 ? agentTypes : DEFAULT_AGENT_TYPES,
    setAccount: setStored,
    isLoading: status.isLoading && !status.data,
    error: status.error,
    refresh: useCallback(() => void status.mutate(), [status.mutate]),
  };
}

export interface UseGitHubRepoResult {
  /** The repository every panel loads from, with the account to read it as. */
  repo: GitHubRepoRef | null;
  /** True when `repo` came from the workspace's `origin` remote rather than a choice. */
  fromWorkspace: boolean;
  workspaceRepo: { owner: string; repo: string } | null;
  recent: string[];
  selectRepo: (owner: string, repo: string) => void;
  clearRepo: () => void;
  isLoading: boolean;
}

/** The repository the dashboard is looking at: the user's pick, else the workspace checkout. */
export function useGitHubRepo(): UseGitHubRepoResult {
  const { account } = useGitHubAccount();
  const workspace = useGitHubWorkspaceRepository();
  const [storedSlug, setStoredSlug] = useLocalStorageState<string | null>(GITHUB_REPO_KEY, null);
  const [recent, setRecent] = useLocalStorageState<string[]>(GITHUB_RECENT_REPOS_KEY, []);

  const workspaceRepo = useMemo(() => {
    const found = workspace.data?.repository;
    return found ? { owner: found.owner, repo: found.repo } : null;
  }, [workspace.data]);

  const selected = storedSlug ? parseRepoSlug(storedSlug) : null;
  const chosen = selected ?? workspaceRepo;
  const repo = useMemo<GitHubRepoRef | null>(
    () => (chosen ? { owner: chosen.owner, repo: chosen.repo, ...(account ? { account } : {}) } : null),
    [account, chosen],
  );

  const selectRepo = useCallback(
    (owner: string, name: string) => {
      const slug = repoSlug(owner, name);
      setStoredSlug(slug);
      setRecent(previous => [slug, ...previous.filter(entry => entry !== slug)].slice(0, MAX_RECENT_REPOS));
    },
    [setRecent, setStoredSlug],
  );

  const clearRepo = useCallback(() => setStoredSlug(null), [setStoredSlug]);

  return {
    repo,
    fromWorkspace: selected === null && workspaceRepo !== null,
    workspaceRepo,
    recent,
    selectRepo,
    clearRepo,
    isLoading: workspace.isLoading && !workspace.data,
  };
}

/** Which list the navigator shows and how it is filtered; shared so a widget copy agrees with the navigator. */
export function useGitHubListFilters() {
  const [kind, setKind] = useLocalStorageState<GitHubItemKind>(GITHUB_LIST_KIND_KEY, "issue");
  const [state, setState] = useLocalStorageState<GitHubItemState>(GITHUB_LIST_STATE_KEY, "open");
  const [label, setLabel] = useLocalStorageState<string>(GITHUB_LIST_LABEL_KEY, "");
  const [assignee, setAssignee] = useLocalStorageState<string>(GITHUB_LIST_ASSIGNEE_KEY, "");
  const [sort, setSort] = useLocalStorageState<GitHubListSort>(GITHUB_LIST_SORT_KEY, DEFAULT_LIST_QUERY.sort);
  const clearQuery = useCallback(() => {
    setLabel("");
    setAssignee("");
    setSort(DEFAULT_LIST_QUERY.sort);
  }, [setAssignee, setLabel, setSort]);
  return { kind, setKind, state, setState, label, setLabel, assignee, setAssignee, sort, setSort, clearQuery };
}

// ─── Unsent comment drafts ────────────────────────────────────────────────────

/** Comment text typed into an item panel but not yet posted, keyed by `owner/repo/kind/number`. */
const drafts = new Map<string, string>();
const draftListeners = new Set<() => void>();
/** A frozen snapshot so `useSyncExternalStore` sees a new reference only when a draft changes. */
let draftSnapshot: ReadonlyMap<string, string> = new Map();

function emitDrafts(): void {
  draftSnapshot = new Map(drafts);
  for (const listener of draftListeners) listener();
}

export function draftKey(owner: string, repo: string, kind: GitHubItemKind, number: number): string {
  return `${owner}/${repo}/${kind}/${number}`;
}

export function setGitHubDraft(key: string, value: string): void {
  if (value.trim()) drafts.set(key, value);
  else drafts.delete(key);
  emitDrafts();
}

export function clearGitHubDraft(key: string): void {
  if (!drafts.has(key)) return;
  drafts.delete(key);
  emitDrafts();
}

/** Test helper. */
export function clearGitHubDrafts(): void {
  drafts.clear();
  emitDrafts();
}

function subscribeDrafts(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => draftListeners.delete(listener);
}

function getDraftSnapshot(): ReadonlyMap<string, string> {
  return draftSnapshot;
}

export function useGitHubDrafts(): ReadonlyMap<string, string> {
  return useSyncExternalStore(subscribeDrafts, getDraftSnapshot, getDraftSnapshot);
}
