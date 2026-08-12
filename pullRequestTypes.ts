/**
 * Domain types for GitHub pull requests, plus normalizers that flatten Octokit's
 * response shapes onto them. This mirrors `types.ts`, which does the same for
 * issues, and reuses the user/label/reaction primitives defined there.
 *
 * A note on optional fields: GitHub's `GET /pulls` and search endpoints return a
 * smaller pull request than `GET /pulls/{number}` does — no diff stats, no
 * mergeability, no comment counts. Those fields are optional here rather than
 * defaulted to zero, so "not fetched" stays distinguishable from "zero".
 */

import {
  type GitHubIssueComment,
  type GitHubLabel,
  type GitHubMilestone,
  type GitHubReactions,
  type GitHubUser,
  toGitHubLabel,
  toGitHubMilestone,
  toGitHubReactions,
  toGitHubUser,
} from "./types.ts";

export type GitHubTeam = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  html_url: string;
};

/** One side of a pull request: `head` is the source, `base` is the target. */
export type GitHubPRRef = {
  label: string;
  ref: string;
  sha: string;
  user?: GitHubUser | undefined;
  /** `owner/name` of the repository the ref lives in; absent if it was deleted. */
  repository?: string | undefined;
};

export type GitHubAutoMerge = {
  enabled_by: GitHubUser | null;
  merge_method: "merge" | "squash" | "rebase";
  commit_title: string;
  commit_message: string;
};

export type GitHubPullRequest = {
  number: number;
  title: string;
  state: "open" | "closed";
  draft: boolean;
  locked: boolean;
  body: string | null;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  requested_reviewers: GitHubUser[];
  requested_teams: GitHubTeam[];
  /** Named `author` for symmetry with `GitHubIssue`; GitHub calls it `user`. */
  author: GitHubUser | null;
  milestone?: GitHubMilestone | undefined;
  created_at: string;
  updated_at: string;
  closed_at?: string | undefined;
  merged_at?: string | undefined;
  merge_commit_sha?: string | undefined;
  html_url: string;
  diff_url?: string | undefined;
  patch_url?: string | undefined;
  head: GitHubPRRef;
  base: GitHubPRRef;
  auto_merge?: GitHubAutoMerge | undefined;
  maintainer_can_modify?: boolean | undefined;
  reactions?: GitHubReactions | undefined;
  /** Set on search results, which span repositories. */
  repository?: string | undefined;

  // Everything below is returned only by `getPullRequest`.
  merged?: boolean | undefined;
  /** `null` while GitHub is still computing mergeability; retry to resolve it. */
  mergeable?: boolean | null | undefined;
  /** e.g. `clean`, `dirty`, `blocked`, `behind`, `unstable`, `unknown`. */
  mergeable_state?: string | undefined;
  rebaseable?: boolean | null | undefined;
  merged_by?: GitHubUser | null | undefined;
  commits?: number | undefined;
  additions?: number | undefined;
  deletions?: number | undefined;
  changed_files?: number | undefined;
  comments?: number | undefined;
  review_comments?: number | undefined;
};

export type GitHubPRFileChange = {
  sha: string;
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  raw_url: string;
  contents_url: string;
  /** The unified diff hunks for this file; absent for binary or very large files. */
  patch?: string | undefined;
  previous_filename?: string | undefined;
};

export type GitHubPRReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";

export type GitHubPRReview = {
  id: number;
  author: GitHubUser | null;
  body: string | null;
  state: GitHubPRReviewState;
  submitted_at: string | null;
  commit_id: string | null;
  html_url: string;
};

export type GitHubPRComment = {
  id: number;
  /** The conversation thread and the code review are separate comment streams. */
  kind: "review" | "conversation";
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  author: GitHubUser | null;
  reactions?: GitHubReactions | undefined;
  // Review comments only:
  path?: string | undefined;
  position?: number | null | undefined;
  line?: number | null | undefined;
  original_line?: number | null | undefined;
  original_position?: number | null | undefined;
  commit_id?: string | undefined;
  /** The review comment this one replies to. */
  in_reply_to_id?: number | undefined;
};

export type GitHubCheckState = "error" | "failure" | "pending" | "success";

export type GitHubPRCheck = {
  /** Legacy commit statuses and Actions check runs are reported side by side. */
  source: "status" | "check_run";
  context: string;
  description: string;
  state: GitHubCheckState;
  target_url?: string | undefined;
  created_at?: string | undefined;
  updated_at?: string | undefined;
};

export type GitHubPRStatus = {
  state: GitHubCheckState;
  sha: string;
  total: number;
  statuses: GitHubPRCheck[];
};

export type GitHubPRListOptions = {
  account?: string | undefined;
  state?: "open" | "closed" | "all" | undefined;
  /** `user:branch` for cross-fork pull requests, or just `branch`. */
  head?: string | undefined;
  base?: string | undefined;
  sort?: "created" | "updated" | "popularity" | "long-running" | undefined;
  direction?: "asc" | "desc" | undefined;
  perPage?: number | undefined;
  page?: number | undefined;
  /** GitHub's pulls endpoint has no label filter, so this one is applied locally. */
  labels?: string[] | undefined;
};

export type GitHubPRSearchOptions = {
  account?: string | undefined;
  sort?: "comments" | "reactions" | "created" | "updated" | undefined;
  order?: "asc" | "desc" | undefined;
  perPage?: number | undefined;
  page?: number | undefined;
};

export type GitHubPRCreateOptions = {
  account?: string | undefined;
  title: string;
  body?: string | undefined;
  head: string;
  base: string;
  draft?: boolean | undefined;
  maintainerCanModify?: boolean | undefined;
};

export type GitHubPRUpdateOptions = {
  account?: string | undefined;
  title?: string | undefined;
  body?: string | undefined;
  state?: "open" | "closed" | undefined;
  base?: string | undefined;
  labels?: string[] | undefined;
  assignees?: string[] | undefined;
  milestone?: number | null | undefined;
  reviewers?: string[] | undefined;
  teamReviewers?: string[] | undefined;
};

export type GitHubPRReviewOptions = {
  account?: string | undefined;
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  body?: string | undefined;
  /** Defaults to the pull request's current head SHA. */
  commitId?: string | undefined;
};

export type GitHubPRCommentOptions = {
  account?: string | undefined;
  /** Supplying a path posts an inline review comment instead of a thread reply. */
  path?: string | undefined;
  line?: number | undefined;
  startLine?: number | undefined;
  side?: "LEFT" | "RIGHT" | undefined;
  /** `file` comments on the file as a whole and needs no line. */
  subjectType?: "line" | "file" | undefined;
  commitId?: string | undefined;
  inReplyTo?: number | undefined;
};

export type GitHubPRCommentListOptions = {
  account?: string | undefined;
  include?: "review" | "conversation" | "all" | undefined;
  perPage?: number | undefined;
  page?: number | undefined;
};

/** The subset of Octokit's user shape this package reads. */
type RawUser = Parameters<typeof toGitHubUser>[0];

type RawTeam = {
  id?: number | undefined;
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | null | undefined;
  html_url?: string | undefined;
};

type RawRef = {
  label?: string | undefined;
  ref: string;
  sha: string;
  user?: RawUser | undefined;
  repo?: { full_name?: string | undefined } | null | undefined;
};

type RawPullRequest = {
  number: number;
  title: string;
  state: string;
  draft?: boolean | undefined;
  locked?: boolean | undefined;
  body?: string | null | undefined;
  labels?: Parameters<typeof toGitHubLabel>[0][] | undefined;
  assignees?: RawUser[] | null | undefined;
  requested_reviewers?: RawUser[] | null | undefined;
  requested_teams?: RawTeam[] | null | undefined;
  user?: RawUser | undefined;
  milestone?: Parameters<typeof toGitHubMilestone>[0] | undefined;
  created_at: string;
  updated_at: string;
  closed_at?: string | null | undefined;
  merged_at?: string | null | undefined;
  merge_commit_sha?: string | null | undefined;
  html_url: string;
  diff_url?: string | null | undefined;
  patch_url?: string | null | undefined;
  head?: RawRef | undefined;
  base?: RawRef | undefined;
  auto_merge?:
    | {
        enabled_by?: RawUser | undefined;
        merge_method?: string | undefined;
        commit_title?: string | null | undefined;
        commit_message?: string | null | undefined;
      }
    | null
    | undefined;
  maintainer_can_modify?: boolean | undefined;
  reactions?: Parameters<typeof toGitHubReactions>[0];
  repository_url?: string | undefined;
  /** Search results are issue-shaped and carry the pull request's URLs here instead. */
  pull_request?:
    | {
        diff_url?: string | null | undefined;
        patch_url?: string | null | undefined;
        merged_at?: string | null | undefined;
      }
    | null
    | undefined;
  merged?: boolean | undefined;
  mergeable?: boolean | null | undefined;
  mergeable_state?: string | undefined;
  rebaseable?: boolean | null | undefined;
  merged_by?: RawUser | undefined;
  commits?: number | undefined;
  additions?: number | undefined;
  deletions?: number | undefined;
  changed_files?: number | undefined;
  comments?: number | undefined;
  review_comments?: number | undefined;
};

type RawFileChange = {
  /** Null for a file GitHub couldn't resolve a blob for, such as a submodule bump. */
  sha: string | null;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  blob_url?: string | null | undefined;
  raw_url?: string | null | undefined;
  contents_url?: string | null | undefined;
  patch?: string | undefined;
  previous_filename?: string | undefined;
};

type RawReview = {
  id: number;
  user?: RawUser | undefined;
  body?: string | null | undefined;
  state: string;
  submitted_at?: string | undefined;
  commit_id?: string | null | undefined;
  html_url: string;
};

type RawReviewComment = {
  id: number;
  body?: string | null | undefined;
  created_at: string;
  updated_at: string;
  html_url: string;
  user?: RawUser | undefined;
  reactions?: Parameters<typeof toGitHubReactions>[0];
  path?: string | undefined;
  position?: number | null | undefined;
  line?: number | null | undefined;
  original_line?: number | null | undefined;
  original_position?: number | null | undefined;
  commit_id?: string | undefined;
  in_reply_to_id?: number | undefined;
};

const FILE_STATUSES = new Set(["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"]);
const REVIEW_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"]);
const MERGE_METHODS = new Set(["merge", "squash", "rebase"]);

/** Derives `owner/repo` from the `repository_url` search results carry. */
function repositoryFromUrl(repositoryUrl: string | undefined): string | undefined {
  if (!repositoryUrl) return undefined;
  return /\/repos\/([^/]+\/[^/]+)$/.exec(repositoryUrl)?.[1];
}

export function toGitHubTeam(team: RawTeam): GitHubTeam {
  return {
    id: team.id ?? 0,
    name: team.name ?? "",
    slug: team.slug ?? "",
    description: team.description ?? null,
    html_url: team.html_url ?? "",
  };
}

export function toGitHubPRRef(ref: RawRef | undefined): GitHubPRRef {
  // A deleted head branch leaves the ref itself intact but blanks the repository.
  if (!ref) return { label: "", ref: "", sha: "" };

  const user = toGitHubUser(ref.user ?? null);
  const repository = ref.repo?.full_name;

  return {
    label: ref.label ?? ref.ref,
    ref: ref.ref,
    sha: ref.sha,
    ...(user ? { user } : {}),
    ...(repository ? { repository } : {}),
  };
}

function toUserList(users: RawUser[] | null | undefined): GitHubUser[] {
  return (users ?? []).map(toGitHubUser).filter((user): user is GitHubUser => user !== null);
}

export function toGitHubPullRequest(pull: RawPullRequest): GitHubPullRequest {
  const milestone = toGitHubMilestone(pull.milestone ?? null);
  const reactions = toGitHubReactions(pull.reactions);
  const repository = repositoryFromUrl(pull.repository_url);
  const mergedBy = pull.merged_by ? toGitHubUser(pull.merged_by) : undefined;
  const autoMergeMethod = pull.auto_merge?.merge_method;
  // Search returns issue-shaped items that hide the pull request URLs one level down.
  const diffUrl = pull.diff_url ?? pull.pull_request?.diff_url;
  const patchUrl = pull.patch_url ?? pull.pull_request?.patch_url;
  const mergedAt = pull.merged_at ?? pull.pull_request?.merged_at;

  return {
    number: pull.number,
    title: pull.title,
    state: pull.state === "closed" ? "closed" : "open",
    draft: pull.draft ?? false,
    locked: pull.locked ?? false,
    body: pull.body ?? null,
    labels: (pull.labels ?? []).map(toGitHubLabel),
    assignees: toUserList(pull.assignees),
    requested_reviewers: toUserList(pull.requested_reviewers),
    requested_teams: (pull.requested_teams ?? []).map(toGitHubTeam),
    author: toGitHubUser(pull.user ?? null),
    ...(milestone ? { milestone } : {}),
    created_at: pull.created_at,
    updated_at: pull.updated_at,
    ...(pull.closed_at ? { closed_at: pull.closed_at } : {}),
    ...(mergedAt ? { merged_at: mergedAt } : {}),
    ...(pull.merge_commit_sha ? { merge_commit_sha: pull.merge_commit_sha } : {}),
    html_url: pull.html_url,
    ...(diffUrl ? { diff_url: diffUrl } : {}),
    ...(patchUrl ? { patch_url: patchUrl } : {}),
    head: toGitHubPRRef(pull.head),
    base: toGitHubPRRef(pull.base),
    ...(pull.auto_merge
      ? {
          auto_merge: {
            enabled_by: toGitHubUser(pull.auto_merge.enabled_by ?? null),
            merge_method: autoMergeMethod && MERGE_METHODS.has(autoMergeMethod) ? (autoMergeMethod as GitHubAutoMerge["merge_method"]) : "merge",
            commit_title: pull.auto_merge.commit_title ?? "",
            commit_message: pull.auto_merge.commit_message ?? "",
          },
        }
      : {}),
    ...(pull.maintainer_can_modify !== undefined ? { maintainer_can_modify: pull.maintainer_can_modify } : {}),
    ...(reactions ? { reactions } : {}),
    ...(repository ? { repository } : {}),
    ...(pull.merged !== undefined ? { merged: pull.merged } : {}),
    ...(pull.mergeable !== undefined ? { mergeable: pull.mergeable } : {}),
    ...(pull.mergeable_state !== undefined ? { mergeable_state: pull.mergeable_state } : {}),
    ...(pull.rebaseable !== undefined ? { rebaseable: pull.rebaseable } : {}),
    ...(mergedBy !== undefined ? { merged_by: mergedBy } : {}),
    ...(pull.commits !== undefined ? { commits: pull.commits } : {}),
    ...(pull.additions !== undefined ? { additions: pull.additions } : {}),
    ...(pull.deletions !== undefined ? { deletions: pull.deletions } : {}),
    ...(pull.changed_files !== undefined ? { changed_files: pull.changed_files } : {}),
    ...(pull.comments !== undefined ? { comments: pull.comments } : {}),
    ...(pull.review_comments !== undefined ? { review_comments: pull.review_comments } : {}),
  };
}

export function toGitHubPRFileChange(file: RawFileChange): GitHubPRFileChange {
  return {
    sha: file.sha ?? "",
    filename: file.filename,
    status: FILE_STATUSES.has(file.status) ? (file.status as GitHubPRFileChange["status"]) : "changed",
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    blob_url: file.blob_url ?? "",
    raw_url: file.raw_url ?? "",
    contents_url: file.contents_url ?? "",
    ...(file.patch !== undefined ? { patch: file.patch } : {}),
    ...(file.previous_filename !== undefined ? { previous_filename: file.previous_filename } : {}),
  };
}

export function toGitHubPRReview(review: RawReview): GitHubPRReview {
  return {
    id: review.id,
    author: toGitHubUser(review.user ?? null),
    body: review.body ?? null,
    state: REVIEW_STATES.has(review.state) ? (review.state as GitHubPRReviewState) : "COMMENTED",
    submitted_at: review.submitted_at ?? null,
    commit_id: review.commit_id ?? null,
    html_url: review.html_url,
  };
}

/**
 * A pull request's conversation thread is stored as issue comments, so those are
 * normalized by `toGitHubIssueComment` first and tagged here.
 */
export function toGitHubPRConversationComment(comment: GitHubIssueComment): GitHubPRComment {
  return { ...comment, kind: "conversation" };
}

export function toGitHubPRReviewComment(comment: RawReviewComment): GitHubPRComment {
  const reactions = toGitHubReactions(comment.reactions);

  return {
    id: comment.id,
    kind: "review",
    body: comment.body ?? "",
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    html_url: comment.html_url,
    author: toGitHubUser(comment.user ?? null),
    ...(reactions ? { reactions } : {}),
    ...(comment.path !== undefined ? { path: comment.path } : {}),
    ...(comment.position !== undefined ? { position: comment.position } : {}),
    ...(comment.line !== undefined ? { line: comment.line } : {}),
    ...(comment.original_line !== undefined ? { original_line: comment.original_line } : {}),
    ...(comment.original_position !== undefined ? { original_position: comment.original_position } : {}),
    ...(comment.commit_id !== undefined ? { commit_id: comment.commit_id } : {}),
    ...(comment.in_reply_to_id !== undefined ? { in_reply_to_id: comment.in_reply_to_id } : {}),
  };
}
