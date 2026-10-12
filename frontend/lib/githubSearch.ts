import { type GitHubItemState, type GitHubRepoRef, githubRPCClient, useTypedSWR } from "@tokenring-ai/one-frontend/rpc.ts";
import type { GitHubItemKind } from "./paths.ts";

/** Largest list the navigator loads; a longer list is searched on the server instead of filtered locally. */
export const GITHUB_LIST_LIMIT = 100;

/** A GitHub search query scoped to one repository, item kind and state. */
export function repositorySearchQuery(ref: { owner: string; repo: string }, kind: GitHubItemKind, state: GitHubItemState, text: string): string {
  return [text.trim(), `repo:${ref.owner}/${ref.repo}`, kind === "issue" ? "is:issue" : "is:pr", state === "all" ? "" : `is:${state}`]
    .filter(Boolean)
    .join(" ");
}

/**
 * Server-side search over a repository's issues or pull requests. Used when
 * the navigator's list is capped, so a filter still finds items past the cap.
 * A null `ref` or empty `text` disables the request.
 */
export function useGitHubItemSearch(ref: GitHubRepoRef | null, kind: GitHubItemKind, state: GitHubItemState, text: string) {
  const q = ref && text.trim() ? repositorySearchQuery(ref, kind, state, text) : null;
  const account = ref?.account;
  return useTypedSWR(q ? `/github/search/${kind}/${account ?? ""}/${q}` : null, async () => {
    const args = { query: q!, perPage: GITHUB_LIST_LIMIT, sort: "updated" as const, ...(account ? { account } : {}) };
    if (kind === "issue") return (await githubRPCClient.searchIssues(args)).issues;
    return (await githubRPCClient.searchPullRequests(args)).pullRequests;
  });
}
