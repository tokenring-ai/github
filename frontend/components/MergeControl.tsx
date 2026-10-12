import type { GitHubPullRequest } from "@tokenring-ai/github/pullRequestTypes";
import type { ConfirmDialogOptions } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { useLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import { type GitHubRepoRef, githubRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Badge, type BadgeTone, Select } from "@tokenring-ai/one-frontend/ui";
import { GitMerge, Timer, TimerOff } from "lucide-react";
import { useCallback, useMemo } from "react";
import ActionButton from "./ActionButton.tsx";
import { MERGE_METHOD_OPTIONS, type MergeMethod, type MergeTone, mergeMethodVerb, mergeReadiness } from "./itemFormat.ts";

/** Last merge method used, so a repository that always squashes is not re-chosen every time. */
export const GITHUB_MERGE_METHOD_KEY = "github:merge-method";

const TONES: Record<MergeTone, BadgeTone> = { success: "success", warning: "warning", danger: "danger", neutral: "neutral" };

export interface MergeControlProps {
  pull: GitHubPullRequest;
  repoRef: GitHubRepoRef;
  busy: boolean;
  openConfirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  /** Runs a write with the panel's toast and refresh handling. */
  run: (action: () => Promise<unknown>, done: string) => Promise<void>;
}

/**
 * Mergeability, merge method, Merge and auto-merge for an open pull request.
 * Merging cannot be undone from here, so it is always confirmed (no "don't
 * ask again"), and it is pinned to the head SHA on screen so commits pushed
 * since the panel loaded are refused instead of merged unseen.
 */
export default function MergeControl({ pull, repoRef, busy, openConfirm, run }: MergeControlProps) {
  const [method, setMethod] = useLocalStorageState<MergeMethod>(GITHUB_MERGE_METHOD_KEY, "merge");
  const readiness = mergeReadiness(pull);
  const target = useMemo(() => ({ ...repoRef, prNumber: pull.number }), [pull.number, repoRef]);
  const branches = `${pull.head.label || pull.head.ref} into ${pull.base.ref}`;
  const autoMerge = pull.auto_merge;

  const merge = useCallback(async () => {
    const confirmed = await openConfirm({
      id: "github-merge-pull",
      title: `${mergeMethodVerb(method)} #${pull.number}?`,
      message: `${mergeMethodVerb(method)} ${branches}. This writes to ${pull.base.ref} and cannot be undone from TokenRing.`,
      confirmText: mergeMethodVerb(method),
      cancelText: "Cancel",
      variant: "warning",
      dontAskAgain: false,
    });
    if (!confirmed) return;
    await run(async () => {
      const { result } = await githubRPCClient.mergePullRequest({ ...target, method, ...(pull.head.sha ? { sha: pull.head.sha } : {}) });
      if (!result.merged) throw new Error(result.message || "GitHub did not merge the pull request");
    }, `Pull request #${pull.number} merged`);
  }, [branches, method, openConfirm, pull.base.ref, pull.head.sha, pull.number, run, target]);

  const enableAutoMerge = useCallback(async () => {
    const confirmed = await openConfirm({
      id: "github-enable-auto-merge",
      title: `Enable auto-merge for #${pull.number}?`,
      message: `GitHub will ${mergeMethodVerb(method).toLowerCase()} ${branches} as soon as its required reviews and checks pass.`,
      confirmText: "Enable auto-merge",
      cancelText: "Cancel",
      variant: "warning",
      dontAskAgain: false,
    });
    if (!confirmed) return;
    await run(() => githubRPCClient.setAutoMerge({ ...target, enabled: true, method }), "Auto-merge enabled");
  }, [branches, method, openConfirm, pull.number, run, target]);

  const disableAutoMerge = useCallback(() => run(() => githubRPCClient.setAutoMerge({ ...target, enabled: false }), "Auto-merge disabled"), [run, target]);

  return (
    <section aria-label="Merge" className="rounded-xl border border-primary bg-secondary px-3 py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <GitMerge className="w-3.5 h-3.5 text-muted shrink-0" />
        <Badge tone={TONES[readiness.tone]} dot>
          <span title={pull.mergeable_state}>{readiness.label}</span>
        </Badge>
        {autoMerge && (
          <Badge tone="info">
            Auto-merge ({autoMerge.merge_method}) enabled{autoMerge.enabled_by ? ` by ${autoMerge.enabled_by.login}` : ""}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select aria-label="Merge method" value={method} onChange={value => setMethod(value as MergeMethod)} disabled={busy} className="w-48">
          {MERGE_METHOD_OPTIONS.map(option => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
        <ActionButton variant="primary" icon={GitMerge} busy={busy} busyLabel="Working…" disabled={!readiness.canMerge} onClick={() => void merge()}>
          {mergeMethodVerb(method)}
        </ActionButton>
        {autoMerge ? (
          <ActionButton icon={TimerOff} disabled={busy} onClick={() => void disableAutoMerge()}>
            Disable auto-merge
          </ActionButton>
        ) : (
          !pull.draft &&
          readiness.tone !== "success" && (
            <ActionButton icon={Timer} disabled={busy} onClick={() => void enableAutoMerge()}>
              Enable auto-merge
            </ActionButton>
          )
        )}
      </div>
    </section>
  );
}
