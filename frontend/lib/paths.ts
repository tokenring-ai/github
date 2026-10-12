/** React-free route helpers shared by the dashboard definition and the views. */

export const GITHUB_PATH = "/github";
/** First segment of `/github/accounts`; checked before treating the segment as an owner. */
export const ACCOUNTS_SEGMENT = "accounts";
export const ACCOUNTS_PATH = `${GITHUB_PATH}/${ACCOUNTS_SEGMENT}`;
/** `:number` value of `/github/:owner/:repo/issues/new` and `/github/:owner/:repo/pulls/new`. */
export const NEW_ISSUE_SEGMENT = "new";

export type GitHubItemKind = "issue" | "pull";

/** URL segment for each item kind, matching GitHub's own URLs. */
export const KIND_SEGMENTS: Record<GitHubItemKind, string> = { issue: "issues", pull: "pulls" };

export function kindFromSegment(segment: string | undefined): GitHubItemKind | null {
  if (segment === "issues") return "issue";
  if (segment === "pulls") return "pull";
  return null;
}

export function repoPath(owner: string, repo: string): string {
  return `${GITHUB_PATH}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export function itemPath(owner: string, repo: string, kind: GitHubItemKind, number: number): string {
  return `${repoPath(owner, repo)}/${KIND_SEGMENTS[kind]}/${number}`;
}

export function newIssuePath(owner: string, repo: string): string {
  return `${repoPath(owner, repo)}/${KIND_SEGMENTS.issue}/${NEW_ISSUE_SEGMENT}`;
}

export function newPullPath(owner: string, repo: string): string {
  return `${repoPath(owner, repo)}/${KIND_SEGMENTS.pull}/${NEW_ISSUE_SEGMENT}`;
}

/** Splits an `owner/repo` slug; null unless it has exactly two non-empty segments. */
export function parseRepoSlug(slug: string): { owner: string; repo: string } | null {
  const [owner, repo, ...rest] = slug.trim().split("/");
  if (!owner || !repo || rest.length > 0) return null;
  return { owner, repo };
}

export function repoSlug(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}
