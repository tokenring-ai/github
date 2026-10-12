import type { StatusBadgeDefinition } from "@tokenring-ai/one-frontend/components/ui/StatusBadge.tsx";
import { formatRelativeTime } from "@tokenring-ai/utility/date/formatRelativeTime";

/** "3 hours ago" for an ISO timestamp; empty for a missing one. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? "" : formatRelativeTime(ms);
}

export const ISSUE_STATE_BADGES: Record<string, StatusBadgeDefinition> = {
  open: { label: "Open", dotColor: "bg-emerald-500", colorClass: "text-emerald-500" },
  closed: { label: "Closed", dotColor: "bg-violet-500", colorClass: "text-violet-500" },
};

export type PullRequestState = "open" | "draft" | "merged" | "closed";

export const PR_STATE_BADGES: Record<PullRequestState, StatusBadgeDefinition> = {
  open: { label: "Open", dotColor: "bg-emerald-500", colorClass: "text-emerald-500" },
  draft: { label: "Draft", dotColor: "bg-stone-400", colorClass: "text-muted" },
  merged: { label: "Merged", dotColor: "bg-violet-500", colorClass: "text-violet-500" },
  closed: { label: "Closed", dotColor: "bg-red-500", colorClass: "text-red-500" },
};

/** GitHub reports a merged pull request as `closed`; the badge should say merged. */
export function pullRequestState(pull: {
  state: "open" | "closed";
  draft: boolean;
  merged_at?: string | undefined;
  merged?: boolean | undefined;
}): PullRequestState {
  if (pull.merged || pull.merged_at) return "merged";
  if (pull.state === "closed") return "closed";
  return pull.draft ? "draft" : "open";
}

export const CHECK_STATE_BADGES: Record<string, StatusBadgeDefinition> = {
  success: { label: "Passing", dotColor: "bg-emerald-500", colorClass: "text-emerald-500" },
  pending: { label: "Pending", dotColor: "bg-amber-500", pulse: true, colorClass: "text-amber-500" },
  failure: { label: "Failing", dotColor: "bg-red-500", colorClass: "text-red-500" },
  error: { label: "Error", dotColor: "bg-red-500", colorClass: "text-red-500" },
};

export const REVIEW_STATE_BADGES: Record<string, StatusBadgeDefinition> = {
  APPROVED: { label: "Approved", dotColor: "bg-emerald-500", colorClass: "text-emerald-500" },
  CHANGES_REQUESTED: { label: "Changes requested", dotColor: "bg-red-500", colorClass: "text-red-500" },
  COMMENTED: { label: "Commented", dotColor: "bg-stone-400", colorClass: "text-muted" },
  DISMISSED: { label: "Dismissed", dotColor: "bg-stone-400", colorClass: "text-muted" },
  PENDING: { label: "Pending", dotColor: "bg-amber-500", colorClass: "text-amber-500" },
};

/** Splits a comma- or whitespace-separated list of logins. */
export function parseLoginList(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[\s,]+/)
        .map(entry => entry.trim().replace(/^@/, ""))
        .filter(Boolean),
    ),
  ];
}

/** GitHub's `mergeable_state` codes in words. */
const MERGEABLE_STATE_LABELS: Record<string, string> = {
  clean: "ready to merge",
  dirty: "has merge conflicts",
  blocked: "merging is blocked (required reviews or checks)",
  behind: "branch is behind its base",
  unstable: "mergeable, but some checks are failing",
  has_hooks: "mergeable (pre-receive hooks will run)",
  draft: "draft — not ready to merge",
  unknown: "mergeability is still being computed",
};

export function mergeableStateLabel(state: string): string {
  return MERGEABLE_STATE_LABELS[state] ?? state.replaceAll("_", " ");
}

/** Comments and reviews are fetched one page at a time; this many is the cap. */
export const ITEM_COMMENT_LIMIT = 100;

export type MergeMethod = "merge" | "squash" | "rebase";

export const MERGE_METHOD_OPTIONS: { id: MergeMethod; label: string; verb: string }[] = [
  { id: "merge", label: "Create a merge commit", verb: "Merge" },
  { id: "squash", label: "Squash and merge", verb: "Squash and merge" },
  { id: "rebase", label: "Rebase and merge", verb: "Rebase and merge" },
];

export function mergeMethodVerb(method: MergeMethod): string {
  return MERGE_METHOD_OPTIONS.find(option => option.id === method)?.verb ?? "Merge";
}

export type MergeTone = "success" | "warning" | "danger" | "neutral";

export interface MergeReadiness {
  tone: MergeTone;
  label: string;
  /** Whether a merge is worth attempting; GitHub still has the final say (branch protection, permissions). */
  canMerge: boolean;
}

/**
 * How ready an open pull request is to merge, from `mergeable` and
 * `mergeable_state` (only `getPullRequest` returns them). Conflicts and
 * drafts are refused up front; a blocked or behind branch is left to GitHub,
 * since an admin may be allowed to merge it anyway.
 */
export function mergeReadiness(pull: { draft: boolean; mergeable?: boolean | null | undefined; mergeable_state?: string | undefined }): MergeReadiness {
  const state = pull.mergeable_state ?? "unknown";
  if (pull.draft || state === "draft") return { tone: "neutral", label: "Draft — mark it ready for review before merging", canMerge: false };
  if (pull.mergeable === false || state === "dirty") return { tone: "danger", label: mergeableStateLabel("dirty"), canMerge: false };
  if (state === "clean" || state === "has_hooks") return { tone: "success", label: mergeableStateLabel(state), canMerge: true };
  if (state === "unknown" || pull.mergeable === null || pull.mergeable === undefined) {
    return { tone: "neutral", label: mergeableStateLabel("unknown"), canMerge: true };
  }
  return { tone: "warning", label: mergeableStateLabel(state), canMerge: true };
}
