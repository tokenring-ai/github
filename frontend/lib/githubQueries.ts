import { type GitHubItemState, type GitHubRepoRef, githubRPCClient, useTypedSWR } from "@tokenring-ai/one-frontend/rpc.ts";
import { GITHUB_LIST_LIMIT } from "./githubSearch.ts";

/**
 * SWR hooks for the GitHub RPC methods the shared `rpc.ts` does not wrap.
 * List keys keep the `/github/issues/` and `/github/pulls/` prefixes the item
 * panels invalidate after a write, so a filtered list refreshes with the rest.
 */

function repoArgs(ref: GitHubRepoRef): GitHubRepoRef {
  return { owner: ref.owner, repo: ref.repo, ...(ref.account ? { account: ref.account } : {}) };
}

function repoKey(ref: GitHubRepoRef): string {
  return `${ref.account ?? ""}/${ref.owner}/${ref.repo}`;
}

export type GitHubIssueSort = "created" | "updated" | "comments";
export type GitHubPullSort = "created" | "updated" | "popularity" | "long-running";
export type GitHubListSort = GitHubIssueSort | GitHubPullSort;

export const ISSUE_SORT_OPTIONS: { id: GitHubIssueSort; label: string }[] = [
  { id: "updated", label: "Recently updated" },
  { id: "created", label: "Newest" },
  { id: "comments", label: "Most commented" },
];

export const PULL_SORT_OPTIONS: { id: GitHubPullSort; label: string }[] = [
  { id: "updated", label: "Recently updated" },
  { id: "created", label: "Newest" },
  { id: "popularity", label: "Most commented" },
  { id: "long-running", label: "Long-running" },
];

/** Server-side filters of the navigator list. Empty strings mean "no filter". */
export interface GitHubListQuery {
  label: string;
  /** Issues only: GitHub's pulls endpoint has no assignee filter. */
  assignee: string;
  sort: GitHubListSort;
}

export const DEFAULT_LIST_QUERY: GitHubListQuery = { label: "", assignee: "", sort: "updated" };

/** The issue sort to request: a pull-only sort (left over from the other tab) falls back to recently updated. */
export function issueSortFor(sort: GitHubListSort): GitHubIssueSort {
  return ISSUE_SORT_OPTIONS.some(option => option.id === sort) ? (sort as GitHubIssueSort) : "updated";
}

export function pullSortFor(sort: GitHubListSort): GitHubPullSort {
  return PULL_SORT_OPTIONS.some(option => option.id === sort) ? (sort as GitHubPullSort) : "updated";
}

/** Issues (never pull requests) of a repository, filtered and sorted by GitHub. */
export function useGitHubIssueList(ref: GitHubRepoRef | null, state: GitHubItemState, query: GitHubListQuery) {
  const sort = issueSortFor(query.sort);
  const label = query.label.trim();
  const assignee = query.assignee.trim().replace(/^@/, "");
  return useTypedSWR(ref ? `/github/issues/${repoKey(ref)}/list/${state}/${sort}/${label}/${assignee}` : null, () =>
    githubRPCClient.listIssues({
      ...repoArgs(ref!),
      state,
      perPage: GITHUB_LIST_LIMIT,
      sort,
      order: "desc",
      ...(label ? { labels: [label] } : {}),
      ...(assignee ? { assignee } : {}),
    }),
  );
}

/** Pull requests of a repository. The label filter is applied by the service to the page GitHub returned. */
export function useGitHubPullList(ref: GitHubRepoRef | null, state: GitHubItemState, query: GitHubListQuery) {
  const sort = pullSortFor(query.sort);
  const label = query.label.trim();
  return useTypedSWR(ref ? `/github/pulls/${repoKey(ref)}/list/${state}/${sort}/${label}` : null, () =>
    githubRPCClient.listPullRequests({
      ...repoArgs(ref!),
      state,
      perPage: GITHUB_LIST_LIMIT,
      sort,
      direction: "desc",
      ...(label ? { labels: [label] } : {}),
    }),
  );
}

/** Branches to offer as the head and base of a new pull request. */
export function useGitHubBranches(ref: GitHubRepoRef | null) {
  return useTypedSWR(ref ? `/github/branches/${repoKey(ref)}` : null, () => githubRPCClient.listBranches({ ...repoArgs(ref!), perPage: 100 }));
}

/** Repository metadata; the new pull request form reads its default branch. */
export function useGitHubRepository(ref: GitHubRepoRef | null) {
  return useTypedSWR(ref ? `/github/repository/${repoKey(ref)}` : null, () => githubRPCClient.getRepository(repoArgs(ref!)));
}
