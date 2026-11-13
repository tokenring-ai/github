import type { GitHubPullRequest } from "@tokenring-ai/github/pullRequestTypes";
import type { GitHubIssue } from "@tokenring-ai/github/types";
import { useAttachedAgentChat } from "@tokenring-ai/one-frontend/apps/chat/useAttachedAgentChat.ts";
import AgentSessionList from "@tokenring-ai/one-frontend/components/AgentSessionList.tsx";
import NavigationSidebarHeader from "@tokenring-ai/one-frontend/components/layout/NavigationSidebarHeader.tsx";
import AsyncListBody from "@tokenring-ai/one-frontend/components/ui/AsyncListBody.tsx";
import ContentListItem from "@tokenring-ai/one-frontend/components/ui/ContentListItem.tsx";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import FilterTabs from "@tokenring-ai/one-frontend/components/ui/FilterTabs.tsx";
import SearchInput from "@tokenring-ai/one-frontend/components/ui/SearchInput.tsx";
import StatusBadge from "@tokenring-ai/one-frontend/components/ui/StatusBadge.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useAppAgentSession } from "@tokenring-ai/one-frontend/hooks/useAppAgentSession.tsx";
import { useDebounce } from "@tokenring-ai/one-frontend/hooks/useDebounce.ts";
import { useSearchFilter } from "@tokenring-ai/one-frontend/hooks/useSearchFilter.ts";
import { useLayoutApi } from "@tokenring-ai/one-frontend/layout/context.ts";
import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import { type GitHubItemState, useGitHubLabels } from "@tokenring-ai/one-frontend/rpc.ts";
import { Select, TextField } from "@tokenring-ai/one-frontend/ui";
import { CircleDot, FilePlus, FunnelX, GitPullRequest, GitPullRequestCreate, KeyRound, MessageSquare, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { ISSUE_STATE_BADGES, PR_STATE_BADGES, pullRequestState, timeAgo } from "../components/itemFormat.ts";
import LabelChip from "../components/LabelChip.tsx";
import RepoPicker from "../components/RepoPicker.tsx";
import { GITHUB_ITEM_VIEW_ID } from "../ids.ts";
import {
  DEFAULT_LIST_QUERY,
  type GitHubListSort,
  ISSUE_SORT_OPTIONS,
  issueSortFor,
  PULL_SORT_OPTIONS,
  pullSortFor,
  useGitHubIssueList,
  useGitHubPullList,
} from "../lib/githubQueries.ts";
import { GITHUB_LIST_LIMIT, useGitHubItemSearch } from "../lib/githubSearch.ts";
import { adoptRouteRepo, draftKey, useGitHubAccount, useGitHubDrafts, useGitHubListFilters, useGitHubRepo } from "../lib/githubStore.ts";
import { type GitHubItemKind, kindFromSegment } from "../lib/paths.ts";
import { useGitHubLayoutNavigation } from "../lib/useGitHubLayoutNavigation.ts";

const KIND_TABS: { id: GitHubItemKind; label: string }[] = [
  { id: "issue", label: "Issues" },
  { id: "pull", label: "Pull requests" },
];

const STATE_OPTIONS: { id: GitHubItemState; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

type ListItem = { kind: GitHubItemKind; number: number; title: string; item: GitHubIssue | GitHubPullRequest };

function ItemRow({ entry, selected, dirty, onClick }: { entry: ListItem; selected: boolean; dirty: boolean; onClick: () => void }) {
  const { item, kind } = entry;
  const badge =
    kind === "pull" ? (
      <StatusBadge status={pullRequestState(item as GitHubPullRequest)} statuses={PR_STATE_BADGES} variant="inline" gap="sm" />
    ) : (
      <StatusBadge status={item.state} statuses={ISSUE_STATE_BADGES} variant="inline" gap="sm" />
    );
  const commentCount = kind === "issue" ? (item as GitHubIssue).comments : ((item as GitHubPullRequest).comments ?? 0);

  return (
    <ContentListItem
      selected={selected}
      onClick={onClick}
      data-testid={`github-row-${kind}-${item.number}`}
      title={
        <span className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-muted text-xs shrink-0">#{item.number}</span>
          <span className="truncate">{item.title}</span>
        </span>
      }
      status={
        <span className="flex items-center gap-1.5">
          {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsent comment" />}
          {badge}
        </span>
      }
      metadata={
        <>
          <span className="truncate">{item.author?.login ?? "ghost"}</span>
          <span>·</span>
          <span className="shrink-0">{timeAgo(item.updated_at)}</span>
          {commentCount > 0 && (
            <>
              <span>·</span>
              <MessageSquare className="w-3 h-3 shrink-0" />
              <span>{commentCount}</span>
            </>
          )}
        </>
      }
      snippet={
        item.labels.length > 0 ? (
          <span className="flex flex-wrap gap-1 mt-1">
            {item.labels.slice(0, 4).map(label => (
              <LabelChip key={label.name} label={label} size="xs" />
            ))}
            {item.labels.length > 4 && <span className="text-[10px] text-muted">+{item.labels.length - 4}</span>}
          </span>
        ) : undefined
      }
    />
  );
}

/** Agents the GitHub app can attach to; keeps the chat panel docked beside the workspace. */
function GitHubAgentSessions({ agentTypes }: { agentTypes: string[] }) {
  const { agentId, agents, isLoading, selectAgent, createAgent, terminateAgent, TerminateDialog } = useAppAgentSession({
    appName: "GitHub dashboard",
    storageKey: "github",
    agentTypes,
  });
  useAttachedAgentChat({ agentId });

  return (
    <>
      <AgentSessionList
        agents={agents}
        selectedAgentId={agentId}
        isLoading={isLoading}
        storageKey="github"
        label="GitHub agents"
        onSelect={selectAgent}
        onCreate={() => void createAgent()}
        onTerminate={id => void terminateAgent(id)}
      />
      <TerminateDialog />
    </>
  );
}

/**
 * The GitHub navigator: repository and account pickers, the issue or pull
 * request list with state and text filters. Rows open an item tab.
 */
export default function GitHubNavigatorPane() {
  // The URL names the focused tab's repository and item; the list highlights it.
  const { route } = useLayoutApi();
  const params = route?.params ?? {};
  const selectedKind = route?.viewId === GITHUB_ITEM_VIEW_ID ? kindFromSegment(params.kind) : null;
  const selectedNumber = Number(params.number);
  const routeOwner = params.owner;
  const routeRepo = params.repo;
  // The URL is authoritative: a deep link to /github/acme/api/... must show and act on acme/api, not the repository picked last.
  useEffect(() => {
    if (routeOwner && routeRepo) adoptRouteRepo(routeOwner, routeRepo);
  }, [routeOwner, routeRepo]);

  const { account, accounts, isAuthenticated, agentTypes, setAccount, isLoading: statusLoading } = useGitHubAccount();
  const { repo, fromWorkspace, workspaceRepo, recent, isLoading: repoLoading } = useGitHubRepo();
  const { kind, setKind, state, setState, label, setLabel, assignee, setAssignee, sort, setSort, clearQuery } = useGitHubListFilters();
  const { openItem, openNewIssue, openNewPull, openAccounts, selectRepo } = useGitHubLayoutNavigation();
  const drafts = useGitHubDrafts();
  const labels = useGitHubLabels(repo);

  // The assignee box is free text: wait for typing to settle before asking GitHub.
  const debouncedAssignee = useDebounce(assignee.trim(), 400);
  const listQuery = useMemo(() => ({ label, assignee: kind === "issue" ? debouncedAssignee : "", sort }), [debouncedAssignee, kind, label, sort]);
  const effectiveSort = kind === "issue" ? issueSortFor(sort) : pullSortFor(sort);
  const filtersActive = label !== "" || (kind === "issue" && assignee.trim() !== "") || effectiveSort !== DEFAULT_LIST_QUERY.sort;

  const issues = useGitHubIssueList(kind === "issue" ? repo : null, state, listQuery);
  const pulls = useGitHubPullList(kind === "pull" ? repo : null, state, listQuery);
  const query = kind === "issue" ? issues : pulls;
  // `/github/acme/api/issues/1` highlights #1 only in acme/api's list, not in another repository's #1.
  const routeShowsRepo = repo !== null && params.owner === repo.owner && params.repo === repo.repo;

  const items = useMemo<ListItem[]>(() => {
    if (kind === "issue") return (issues.data?.issues ?? []).map(item => ({ kind: "issue", number: item.number, title: item.title, item }));
    return (pulls.data?.pullRequests ?? []).map(item => ({ kind: "pull", number: item.number, title: item.title, item }));
  }, [issues.data, kind, pulls.data]);

  const {
    query: search,
    setQuery: setSearch,
    filtered,
  } = useSearchFilter({
    items,
    searchFields: entry => `#${entry.number} ${entry.title} ${entry.item.labels.map(label => label.name).join(" ")} ${entry.item.author?.login ?? ""}`,
  });

  // The list holds at most GITHUB_LIST_LIMIT items. When it is full, filtering
  // it locally would miss everything past the cap, so the filter searches GitHub.
  const capped = items.length >= GITHUB_LIST_LIMIT;
  const debouncedSearch = useDebounce(search.trim(), 300);
  // The server search carries the list's label and assignee filters as search qualifiers.
  const searchText = debouncedSearch
    ? [debouncedSearch, label ? `label:"${label}"` : "", kind === "issue" && listQuery.assignee ? `assignee:${listQuery.assignee}` : ""]
        .filter(Boolean)
        .join(" ")
    : "";
  const serverSearch = useGitHubItemSearch(capped ? repo : null, kind, state, searchText);
  const searchingServer = capped && search.trim() !== "";
  const serverItems = useMemo<ListItem[] | undefined>(
    () =>
      serverSearch.data?.map(item =>
        kind === "issue"
          ? { kind: "issue" as const, number: item.number, title: item.title, item: item as GitHubIssue }
          : { kind: "pull" as const, number: item.number, title: item.title, item: item as GitHubPullRequest },
      ),
    [kind, serverSearch.data],
  );
  // Until GitHub answers, the locally filtered first page stays on screen.
  const shown = searchingServer && serverItems ? serverItems : filtered;

  const refresh = useCallback(() => {
    void query.mutate();
    if (searchingServer) void serverSearch.mutate();
  }, [query.mutate, searchingServer, serverSearch.mutate]);

  const noun = kind === "issue" ? "issues" : "pull requests";
  const needsAccount = !statusLoading && accounts.length === 0;

  let body: React.ReactNode;
  if (!repo) {
    body = (
      <EmptyState
        variant="inline"
        title={repoLoading ? "Looking for a repository…" : "No repository selected"}
        hint={repoLoading ? undefined : "Pick one above: the workspace's origin, a recent repository, or search GitHub."}
      />
    );
  } else {
    body = (
      <AsyncListBody
        isLoading={query.isLoading && !query.data}
        error={query.error ?? (searchingServer ? serverSearch.error : undefined)}
        onRetry={refresh}
        hasItems={shown.length > 0}
        variant="nested"
        loadingMessage={`Loading ${noun}…`}
        errorTitle={`Failed to load ${noun}`}
        emptyIcon={kind === "issue" ? CircleDot : GitPullRequest}
        emptyTitle={
          search ? `No ${noun} matching "${search}"` : `No ${state === "all" ? "" : `${state} `}${noun}${filtersActive ? " match these filters" : ""}`
        }
      >
        <ul aria-label={kind === "issue" ? "Issues" : "Pull requests"}>
          {shown.map(entry => (
            <li key={`${entry.kind}-${entry.number}`}>
              <ItemRow
                entry={entry}
                selected={routeShowsRepo && selectedKind === entry.kind && selectedNumber === entry.number}
                dirty={drafts.has(draftKey(repo.owner, repo.repo, entry.kind, entry.number))}
                onClick={() => openItem(entry.kind, entry.number)}
              />
            </li>
          ))}
        </ul>
      </AsyncListBody>
    );
  }

  return (
    <ViewShell
      tone="sidebar"
      scroll={false}
      header={
        <NavigationSidebarHeader
          title={
            <RepoPicker
              current={repo ? { owner: repo.owner, repo: repo.repo } : null}
              fromWorkspace={fromWorkspace}
              workspaceRepo={workspaceRepo}
              recent={recent}
              account={account ?? undefined}
              loading={repoLoading}
              onSelect={selectRepo}
            />
          }
          actions={[
            {
              key: "new",
              icon: <FilePlus className="w-3.5 h-3.5" />,
              label: "New issue",
              title: !repo ? "Pick a repository to file an issue" : isAuthenticated ? "New issue" : "Sign in to GitHub (Accounts) to file issues",
              onClick: openNewIssue,
              disabled: !repo || !isAuthenticated,
            },
            {
              key: "new-pull",
              icon: <GitPullRequestCreate className="w-3.5 h-3.5" />,
              label: "New pull request",
              title: !repo
                ? "Pick a repository to open a pull request"
                : isAuthenticated
                  ? "New pull request"
                  : "Sign in to GitHub (Accounts) to open pull requests",
              onClick: openNewPull,
              disabled: !repo || !isAuthenticated,
            },
            { key: "accounts", icon: <KeyRound className="w-3.5 h-3.5" />, label: "GitHub accounts", title: "Accounts", onClick: openAccounts },
            { key: "refresh", icon: <RefreshCw className="w-3.5 h-3.5" />, label: "Refresh list", title: "Refresh", onClick: refresh, disabled: !repo },
          ]}
        />
      }
    >
      {accounts.length > 1 && (
        <div className="px-3 py-1.5 border-b border-primary shrink-0 flex items-center gap-2">
          <label htmlFor="github-account" className="text-[10px] uppercase tracking-wider text-muted shrink-0">
            As
          </label>
          <Select id="github-account" value={account ?? ""} onChange={value => setAccount(value || null)} className="flex-1 min-w-0">
            <option value="">Default account</option>
            {accounts.map(candidate => (
              <option key={candidate.name} value={candidate.name}>
                {candidate.login ? `${candidate.name} (${candidate.login})` : candidate.name}
                {candidate.isAuthenticated ? "" : " · not connected"}
              </option>
            ))}
          </Select>
        </div>
      )}

      <FilterTabs tabs={KIND_TABS} value={kind} onChange={setKind} />

      <div className="px-3 py-2 border-b border-primary shrink-0 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <SearchInput value={search} onChange={setSearch} placeholder={`Filter ${noun}…`} aria-label={`Filter ${noun}`} size="sm" />
        </div>
        <div role="radiogroup" aria-label="State" className="flex rounded-md border border-primary overflow-hidden shrink-0">
          {STATE_OPTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={state === option.id}
              onClick={() => setState(option.id)}
              className={cn(
                "px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer focus-ring",
                state === option.id ? "bg-active text-primary" : "text-muted hover:text-primary hover:bg-hover",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {repo && (
        <div className="px-3 py-2 border-b border-primary shrink-0 flex flex-wrap items-end gap-2" role="group" aria-label="List filters">
          <Select aria-label="Label filter" value={label} onChange={setLabel} className="flex-1 min-w-24">
            <option value="">Any label</option>
            {label && !labels.data?.labels.some(candidate => candidate.name === label) && <option value={label}>{label}</option>}
            {labels.data?.labels.map(candidate => (
              <option key={candidate.name} value={candidate.name}>
                {candidate.name}
              </option>
            ))}
          </Select>
          {kind === "issue" && (
            <TextField aria-label="Assignee filter" value={assignee} onChange={setAssignee} placeholder="Assignee" className="flex-1 min-w-24" />
          )}
          <Select aria-label="Sort" value={effectiveSort} onChange={value => setSort(value as GitHubListSort)} className="flex-1 min-w-28">
            {(kind === "issue" ? ISSUE_SORT_OPTIONS : PULL_SORT_OPTIONS).map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
          {filtersActive && (
            <button
              type="button"
              onClick={clearQuery}
              title="Clear filters"
              aria-label="Clear filters"
              className="p-1.5 text-muted hover:text-primary transition-colors cursor-pointer rounded focus-ring shrink-0"
            >
              <FunnelX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {repo && !needsAccount && !statusLoading && !isAuthenticated && (
        <div className="shrink-0 border-b border-primary px-3 py-2 text-[11px] text-muted flex items-start gap-2">
          <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Sign in to GitHub to file issues, comment or review.{" "}
            <button type="button" onClick={openAccounts} className="text-accent hover:text-accent-soft cursor-pointer transition-colors focus-ring">
              Sign in →
            </button>
          </span>
        </div>
      )}

      {needsAccount && (
        <div className="shrink-0 border-b border-primary px-3 py-2 text-[11px] text-muted flex items-start gap-2">
          <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            No GitHub account configured: public repositories are browsed anonymously at a low rate limit, and filing issues or commenting needs a signed-in
            account.{" "}
            <button type="button" onClick={openAccounts} className="text-accent hover:text-accent-soft cursor-pointer transition-colors focus-ring">
              Manage accounts →
            </button>
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">{body}</div>

      {repo && query.data && (
        <div className="shrink-0 border-t border-primary px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted min-w-0 truncate">
            {searchingServer
              ? serverItems
                ? `${serverItems.length}${serverItems.length >= GITHUB_LIST_LIMIT ? "+" : ""} ${noun} found on GitHub`
                : `Searching GitHub for "${search.trim()}"…`
              : search
                ? `${filtered.length} of ${items.length} ${noun}`
                : `${items.length} ${noun}${capped ? ` (first ${GITHUB_LIST_LIMIT}; filter to search all)` : ""}`}
          </span>
          <button
            type="button"
            onClick={refresh}
            className="p-1 text-muted hover:text-primary transition-colors cursor-pointer rounded focus-ring shrink-0"
            title="Refresh"
            aria-label={`Refresh ${noun}`}
          >
            <RefreshCw className={cn("w-3 h-3", query.isValidating && "animate-spin")} />
          </button>
        </div>
      )}

      <div className="shrink-0 border-t border-primary">
        <GitHubAgentSessions agentTypes={agentTypes} />
      </div>
    </ViewShell>
  );
}
