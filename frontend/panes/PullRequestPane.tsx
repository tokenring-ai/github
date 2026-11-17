import type { GitHubPRComment, GitHubPRReview } from "@tokenring-ai/github/pullRequestTypes";
import { usePanelBadge, usePanelTitle } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import FilterTabs from "@tokenring-ai/one-frontend/components/ui/FilterTabs.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import StatusBadge from "@tokenring-ai/one-frontend/components/ui/StatusBadge.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { useBusyAction } from "@tokenring-ai/one-frontend/hooks/useBusyAction.ts";
import { useConfirmDialog } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { useTabState } from "@tokenring-ai/one-frontend/hooks/useTabState.ts";
import { usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import {
  type GitHubRepoRef,
  githubRPCClient,
  useGitHubLabels,
  useGitHubPRFiles,
  useGitHubPRStatus,
  useGitHubPullRequest,
} from "@tokenring-ai/one-frontend/rpc.ts";
import { TextArea, TextField } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Bot, CircleDot, FileDiff, GitPullRequestClosed, ListChecks, MessageSquare, Pencil, Save, UserPlus, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import ActionButton from "../components/ActionButton.tsx";
import ChecksList from "../components/ChecksList.tsx";
import CommentComposer from "../components/CommentComposer.tsx";
import ItemPaneShell from "../components/ItemPaneShell.tsx";
import {
  CHECK_STATE_BADGES,
  ITEM_COMMENT_LIMIT,
  mergeableStateLabel,
  PR_STATE_BADGES,
  parseLoginList,
  pullRequestState,
  REVIEW_STATE_BADGES,
  timeAgo,
} from "../components/itemFormat.ts";
import LabelChip from "../components/LabelChip.tsx";
import LabelPicker from "../components/LabelPicker.tsx";
import Markdown from "../components/Markdown.tsx";
import MergeControl from "../components/MergeControl.tsx";
import PatchView from "../components/PatchView.tsx";
import ReviewDialog, { type ReviewEvent } from "../components/ReviewDialog.tsx";
import TimelineEntry, { Avatar } from "../components/TimelineEntry.tsx";
import { clearGitHubDraft, draftKey, setGitHubDraft, useGitHubAccount, useGitHubDrafts } from "../lib/githubStore.ts";
import { useWorkWithAgent } from "../lib/useGitHubWorkWithAgent.ts";

type Tab = "conversation" | "files" | "checks";
const TABS: readonly Tab[] = ["conversation", "files", "checks"];

interface EditDraft {
  title: string;
  body: string;
}

type TimelineItem = { id: string; at: string; review?: GitHubPRReview; comment?: GitHubPRComment };

/** Reviews and both comment streams, oldest first. Empty "commented" reviews carry no information and are dropped. */
function buildTimeline(reviews: GitHubPRReview[], comments: GitHubPRComment[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const review of reviews) {
    if (review.state === "COMMENTED" && !review.body) continue;
    items.push({ id: `review-${review.id}`, at: review.submitted_at ?? "", review });
  }
  for (const comment of comments) items.push({ id: `${comment.kind}-${comment.id}`, at: comment.created_at, comment });
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

const FILE_STATUS_CLASSES: Record<string, string> = {
  added: "text-emerald-500",
  removed: "text-red-500",
  renamed: "text-sky-500",
  modified: "text-amber-500",
};

function FilesTab({ repoRef, number }: { repoRef: GitHubRepoRef; number: number }) {
  const [page, setPage] = useState(1);
  const files = useGitHubPRFiles(repoRef, number, page);
  const list = files.data?.files ?? [];

  if (files.isLoading && !files.data) return <LoadingState message="Loading changed files…" className="py-10" />;
  if (files.error) return <ErrorState title="Failed to load files" error={files.error} onRetry={() => void files.mutate()} variant="inline" />;
  if (list.length === 0 && page === 1) return <EmptyState variant="inline" icon={FileDiff} title="No changed files" />;

  return (
    <div className="space-y-2">
      {list.map(file => (
        <details key={file.filename} className="rounded-xl border border-primary bg-secondary overflow-hidden" open={list.length <= 5}>
          <summary className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none text-sm hover:bg-hover">
            <span className={cn("text-[10px] uppercase tracking-wider font-semibold w-16 shrink-0", FILE_STATUS_CLASSES[file.status] ?? "text-muted")}>
              {file.status}
            </span>
            <span className="font-mono text-xs text-primary truncate flex-1 min-w-0" title={file.filename}>
              {file.previous_filename ? `${file.previous_filename} → ` : ""}
              {file.filename}
            </span>
            <span className="text-xs font-mono shrink-0">
              <span className="text-emerald-500">+{file.additions}</span> <span className="text-red-500">−{file.deletions}</span>
            </span>
          </summary>
          <div className="border-t border-primary bg-primary">
            {file.patch ? (
              <PatchView patch={file.patch} />
            ) : (
              <p className="px-3 py-2 text-xs text-muted italic">No text diff available (binary or too large).</p>
            )}
          </div>
        </details>
      ))}
      {(page > 1 || list.length >= 50) && (
        <div className="flex items-center justify-between text-xs text-muted pt-1">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="hover:text-primary disabled:opacity-40 cursor-pointer focus-ring"
          >
            ← Previous
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            disabled={list.length < 50}
            onClick={() => setPage(page + 1)}
            className="hover:text-primary disabled:opacity-40 cursor-pointer focus-ring"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function ChecksTab({ repoRef, number }: { repoRef: GitHubRepoRef; number: number }) {
  const status = useGitHubPRStatus(repoRef, number);
  if (status.isLoading && !status.data) return <LoadingState message="Loading checks…" className="py-10" />;
  if (status.error) return <ErrorState title="Failed to load checks" error={status.error} onRetry={() => void status.mutate()} variant="inline" />;
  if (!status.data) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <StatusBadge status={status.data.status.state} statuses={CHECK_STATE_BADGES} />
        <span className="text-xs text-muted font-mono">{status.data.status.sha.slice(0, 7)}</span>
        <span className="text-xs text-muted">· {status.data.status.total} checks</span>
      </div>
      <ChecksList status={status.data.status} />
    </div>
  );
}

export interface PullRequestPaneProps {
  owner: string;
  repo: string;
  number: number;
}

/** One pull request: conversation, changed files, checks, and review actions. */
export default function PullRequestPane({ owner, repo, number }: PullRequestPaneProps) {
  const panel = usePanel();
  const { account, agentTypes, isAuthenticated } = useGitHubAccount();
  const repoRef = useMemo<GitHubRepoRef>(() => ({ owner, repo, ...(account ? { account } : {}) }), [account, owner, repo]);
  const query = useGitHubPullRequest(repoRef, number);
  const labels = useGitHubLabels(isAuthenticated ? repoRef : null);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const pull = query.data?.pullRequest ?? null;
  const timeline = useMemo(() => buildTimeline(query.data?.reviews ?? [], query.data?.comments ?? []), [query.data]);
  const { mutate: globalMutate } = useSWRConfig();
  const { activeTab, setActiveTab } = useTabState<Tab>(TABS);
  const { busy: startingAgent, workWithAgent } = useWorkWithAgent(agentTypes);
  const { busy: commenting, execute: executeComment } = useBusyAction();
  const { busy: acting, execute: executeAction } = useBusyAction();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewerInput, setReviewerInput] = useState<string | null>(null);
  const { openConfirm, Dialog: ConfirmDialog } = useConfirmDialog();

  // Reviews and each comment stream are fetched one page at a time.
  const loadedComments = query.data?.comments ?? [];
  const commentsCapped =
    (query.data?.reviews.length ?? 0) >= ITEM_COMMENT_LIMIT ||
    loadedComments.filter(comment => comment.kind === "conversation").length >= ITEM_COMMENT_LIMIT ||
    loadedComments.filter(comment => comment.kind === "review").length >= ITEM_COMMENT_LIMIT ||
    (pull?.comments ?? 0) + (pull?.review_comments ?? 0) > loadedComments.length;

  const key = draftKey(owner, repo, "pull", number);
  const draft = useGitHubDrafts().get(key) ?? "";
  const state = pull ? pullRequestState(pull) : "open";

  const refreshLists = useCallback(() => {
    void globalMutate(candidate => typeof candidate === "string" && candidate.startsWith("/github/pulls/"), undefined, { revalidate: true });
  }, [globalMutate]);

  usePanelTitle(pull ? `#${number} ${pull.title}` : `PR #${number}`);

  const editing = edit !== null && pull !== null && (edit.title !== pull.title || edit.body !== (pull.body ?? ""));
  usePanelBadge(editing ? { tone: "warning", label: "Unsaved edits" } : draft ? { tone: "warning", label: "Unsent comment" } : null);

  /** Runs one action at a time; true when it succeeded (false on failure, or when another was running). */
  const run = useCallback(
    async (action: () => Promise<unknown>, done: string): Promise<boolean> => {
      const succeeded = await executeAction(async () => {
        try {
          await action();
          toastManager.success(done, { duration: 2500 });
          void query.mutate();
          refreshLists();
          return true;
        } catch (error) {
          toastManager.error(formatError(error), { duration: 6000 });
          return false;
        }
      });
      if (succeeded === undefined) toastManager.info("Another action is still running; try again in a moment.", { duration: 3000 });
      return succeeded === true;
    },
    [executeAction, query.mutate, refreshLists],
  );

  /** Closing notifies everyone watching the pull request, so it is confirmed first. */
  const closePull = useCallback(async () => {
    const confirmed = await openConfirm({
      id: "github-close-pull",
      title: `Close pull request #${number}?`,
      message: `Close #${number} without merging? Its branch and commits are kept, and you can reopen it later.`,
      confirmText: "Close pull request",
      cancelText: "Keep open",
      variant: "danger",
      dontAskAgain: false,
    });
    if (!confirmed) return;
    await run(() => githubRPCClient.closePullRequest({ ...repoRef, prNumber: number }), "Pull request closed");
  }, [number, openConfirm, repoRef, run]);

  const submitComment = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    await executeComment(async () => {
      try {
        await githubRPCClient.commentPullRequest({ ...repoRef, prNumber: number, body });
        clearGitHubDraft(key);
        toastManager.success("Comment posted", { duration: 2500 });
        void query.mutate();
        refreshLists();
      } catch (error) {
        toastManager.error(formatError(error), { duration: 6000 });
      }
    });
  }, [draft, executeComment, key, number, query.mutate, refreshLists, repoRef]);

  const submitReview = useCallback(
    async (event: ReviewEvent, body: string) => {
      // Kept open on failure, so the review can be retried as written.
      if (await run(() => githubRPCClient.reviewPullRequest({ ...repoRef, prNumber: number, event, ...(body ? { body } : {}) }), "Review submitted")) {
        setReviewOpen(false);
      }
    },
    [number, repoRef, run],
  );

  const requestReviewers = useCallback(async () => {
    const reviewers = parseLoginList(reviewerInput ?? "");
    if (reviewers.length === 0) return;
    if (await run(() => githubRPCClient.addPRReviewers({ ...repoRef, prNumber: number, reviewers }), `Requested review from ${reviewers.join(", ")}`)) {
      setReviewerInput(null);
    }
  }, [number, repoRef, reviewerInput, run]);

  /** Pull requests share issue numbers, so labels go through the issue label endpoints. */
  const toggleLabel = useCallback(
    async (name: string, currentlySelected: boolean) => {
      await executeAction(async () => {
        try {
          if (currentlySelected) await githubRPCClient.removeLabel({ ...repoRef, issueNumber: number, label: name });
          else await githubRPCClient.addLabels({ ...repoRef, issueNumber: number, labels: [name] });
          void query.mutate();
          refreshLists();
        } catch (error) {
          toastManager.error(formatError(error), { duration: 6000 });
        }
      });
    },
    [executeAction, number, query.mutate, refreshLists, repoRef],
  );

  const saveEdit = useCallback(async () => {
    if (!edit || !pull) return;
    const title = edit.title.trim();
    if (!title) return;
    const changes = {
      ...(title !== pull.title ? { title } : {}),
      ...(edit.body !== (pull.body ?? "") ? { body: edit.body } : {}),
    };
    // The form stays open with your text if the save fails.
    if (
      Object.keys(changes).length > 0 &&
      !(await run(() => githubRPCClient.updatePullRequest({ ...repoRef, prNumber: number, ...changes }), "Pull request updated"))
    ) {
      return;
    }
    setEdit(null);
  }, [edit, number, pull, repoRef, run]);

  return (
    <ItemPaneShell
      owner={owner}
      repo={repo}
      number={number}
      kindLabel="Pull request"
      htmlUrl={pull?.html_url}
      loading={query.isLoading}
      error={query.error}
      loaded={pull !== null}
      onRefresh={() => void query.mutate()}
      onClose={() => panel.close()}
      header={
        pull && (
          <>
            <div className="flex items-start justify-between gap-3">
              {edit ? (
                <TextField
                  aria-label="Pull request title"
                  value={edit.title}
                  onChange={title => setEdit({ ...edit, title })}
                  disabled={acting}
                  size="md"
                  className="flex-1"
                />
              ) : (
                <h2 className="text-lg font-bold text-primary leading-snug flex-1 min-w-0">
                  {pull.title} <span className="text-muted font-normal">#{pull.number}</span>
                </h2>
              )}
              <StatusBadge status={state} statuses={PR_STATE_BADGES} />
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <Avatar user={pull.author} size="sm" />
                <span className="text-primary font-medium">{pull.author?.login ?? "ghost"}</span> wants to merge
              </span>
              <span className="font-mono text-primary">{pull.head.label || pull.head.ref}</span>
              <span>into</span>
              <span className="font-mono text-primary">{pull.base.ref}</span>
              <span>· updated {timeAgo(pull.updated_at)}</span>
              {pull.merged_at && <span>· merged {timeAgo(pull.merged_at)}</span>}
              {pull.changed_files !== undefined && (
                <span>
                  · {pull.changed_files} files, <span className="text-emerald-500">+{pull.additions ?? 0}</span>{" "}
                  <span className="text-red-500">−{pull.deletions ?? 0}</span>
                </span>
              )}
              {/* Signed-in users see mergeability in the merge box instead. */}
              {!isAuthenticated && pull.mergeable_state && pull.state === "open" && (
                <span title={pull.mergeable_state}>· {mergeableStateLabel(pull.mergeable_state)}</span>
              )}
            </div>

            {(pull.requested_reviewers.length > 0 || pull.requested_teams.length > 0) && (
              <section className="flex flex-wrap items-center gap-1.5 text-xs text-muted" aria-label="Requested reviewers">
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>Review requested from</span>
                {pull.requested_reviewers.map(user => (
                  <span key={`user-${user.login}`} className="flex items-center gap-1 text-primary">
                    <Avatar user={user} size="sm" />
                    {user.login}
                  </span>
                ))}
                {pull.requested_teams.map(team => (
                  <span key={`team-${team.slug}`} className="text-primary" title={team.description ?? undefined}>
                    @{repoRef.owner}/{team.slug}
                  </span>
                ))}
              </section>
            )}

            {(pull.labels.length > 0 || (isAuthenticated && state !== "merged")) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {pull.labels.map(label => (
                  <LabelChip key={label.name} label={label} {...(isAuthenticated ? { onRemove: () => void toggleLabel(label.name, true) } : {})} />
                ))}
                {isAuthenticated && (
                  <LabelPicker
                    available={labels.data?.labels}
                    loading={labels.isLoading}
                    selected={pull.labels.map(label => label.name)}
                    busy={acting}
                    onToggle={(name, selected) => void toggleLabel(name, selected)}
                  />
                )}
              </div>
            )}

            {isAuthenticated && (state === "open" || state === "draft") && (
              <MergeControl pull={pull} repoRef={repoRef} busy={acting} openConfirm={openConfirm} run={run} />
            )}

            <div className="flex flex-wrap items-center gap-2">
              {isAuthenticated &&
                (edit ? (
                  <>
                    <ActionButton variant="primary" icon={Save} busy={acting} busyLabel="Saving…" disabled={!edit.title.trim()} onClick={() => void saveEdit()}>
                      Save
                    </ActionButton>
                    <ActionButton onClick={() => setEdit(null)} disabled={acting}>
                      Cancel
                    </ActionButton>
                  </>
                ) : (
                  <ActionButton
                    icon={Pencil}
                    disabled={acting}
                    onClick={() => {
                      setEdit({ title: pull.title, body: pull.body ?? "" });
                      setActiveTab("conversation");
                    }}
                  >
                    Edit
                  </ActionButton>
                ))}
              {isAuthenticated && state !== "merged" && (
                <ActionButton variant="primary" icon={ListChecks} onClick={() => setReviewOpen(true)} disabled={acting}>
                  Review
                </ActionButton>
              )}
              {isAuthenticated && state !== "merged" && (
                <ActionButton icon={UserPlus} onClick={() => setReviewerInput(current => (current === null ? "" : null))} disabled={acting}>
                  Request reviewers
                </ActionButton>
              )}
              {isAuthenticated &&
                (state === "closed" ? (
                  <ActionButton
                    icon={CircleDot}
                    variant="success"
                    busy={acting}
                    busyLabel="Reopening…"
                    onClick={() => void run(() => githubRPCClient.updatePullRequest({ ...repoRef, prNumber: number, state: "open" }), "Pull request reopened")}
                  >
                    Reopen
                  </ActionButton>
                ) : state !== "merged" ? (
                  <ActionButton icon={GitPullRequestClosed} variant="danger" busy={acting} busyLabel="Closing…" onClick={() => void closePull()}>
                    Close
                  </ActionButton>
                ) : null)}
              <ActionButton icon={Bot} busy={startingAgent} busyLabel="Opening…" onClick={() => void workWithAgent("pull", owner, repo, number, pull.title)}>
                Work with agent
              </ActionButton>
            </div>

            {reviewerInput !== null && (
              <div className="flex items-center gap-2">
                <label htmlFor={`pr-reviewers-${number}`} className="sr-only">
                  Reviewers
                </label>
                <TextField
                  id={`pr-reviewers-${number}`}
                  value={reviewerInput}
                  onChange={setReviewerInput}
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void requestReviewers();
                    }
                  }}
                  placeholder="octocat, hubot"
                  className="flex-1"
                />
                <ActionButton variant="primary" busy={acting} onClick={() => void requestReviewers()} disabled={parseLoginList(reviewerInput).length === 0}>
                  Request
                </ActionButton>
              </div>
            )}

            <FilterTabs<Tab>
              tabs={[
                { id: "conversation", label: "Conversation", count: timeline.length },
                { id: "files", label: "Files", ...(pull.changed_files !== undefined ? { count: pull.changed_files } : {}) },
                { id: "checks", label: "Checks" },
              ]}
              value={activeTab}
              onChange={setActiveTab}
              className="-mx-5 -mb-3 border-b-0"
            />
          </>
        )
      }
    >
      {pull && activeTab === "conversation" && (
        <div className="space-y-3 max-w-3xl">
          <TimelineEntry author={pull.author} createdAt={pull.created_at} htmlUrl={pull.html_url}>
            {edit ? (
              <TextArea
                aria-label="Pull request description"
                value={edit.body}
                onChange={body => setEdit({ ...edit, body })}
                rows={10}
                mono
                disabled={acting}
                placeholder="Describe the change (Markdown)"
              />
            ) : pull.body ? (
              <Markdown>{pull.body}</Markdown>
            ) : (
              <p className="text-sm text-muted italic">No description provided.</p>
            )}
          </TimelineEntry>

          {timeline.map(item =>
            item.review ? (
              <TimelineEntry
                key={item.id}
                author={item.review.author}
                createdAt={item.review.submitted_at}
                htmlUrl={item.review.html_url}
                badge={<StatusBadge status={item.review.state} statuses={REVIEW_STATE_BADGES} variant="inline" gap="sm" />}
              >
                {item.review.body ? <Markdown>{item.review.body}</Markdown> : <p className="text-xs text-muted italic">No summary.</p>}
              </TimelineEntry>
            ) : item.comment ? (
              <TimelineEntry
                key={item.id}
                author={item.comment.author}
                createdAt={item.comment.created_at}
                htmlUrl={item.comment.html_url}
                badge={
                  item.comment.kind === "review" ? (
                    <span className="font-mono text-[11px] text-muted truncate">
                      {item.comment.path}
                      {item.comment.line ? `:${item.comment.line}` : ""}
                    </span>
                  ) : undefined
                }
              >
                <Markdown>{item.comment.body}</Markdown>
              </TimelineEntry>
            ) : null,
          )}

          {commentsCapped && (
            <p className="text-xs text-muted rounded-lg border border-dashed border-primary px-3 py-2">
              Showing the first {ITEM_COMMENT_LIMIT} comments and reviews of each kind.{" "}
              <a href={pull.html_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-soft focus-ring">
                See the full conversation on GitHub →
              </a>
            </p>
          )}

          {isAuthenticated ? (
            <CommentComposer
              value={draft}
              onChange={value => setGitHubDraft(key, value)}
              onSubmit={() => void submitComment()}
              busy={commenting}
              disabled={pull.locked}
            />
          ) : (
            <p className="text-xs text-muted flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> Connect a GitHub account to comment or review.
            </p>
          )}
        </div>
      )}
      {pull && activeTab === "files" && <FilesTab repoRef={repoRef} number={number} />}
      {pull && activeTab === "checks" && <ChecksTab repoRef={repoRef} number={number} />}

      <ReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} onSubmit={submitReview} busy={acting} />
      <ConfirmDialog />
    </ItemPaneShell>
  );
}
