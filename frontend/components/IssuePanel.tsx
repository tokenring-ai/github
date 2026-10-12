import InlineDropdown, { InlineDropdownItem } from "@tokenring-ai/one-frontend/components/ui/InlineDropdown.tsx";
import StatusBadge from "@tokenring-ai/one-frontend/components/ui/StatusBadge.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { setPanelBadge } from "@tokenring-ai/one-frontend/dock/panelBadges.ts";
import type { ViewPanelHandle } from "@tokenring-ai/one-frontend/dock/types.ts";
import { useBusyAction } from "@tokenring-ai/one-frontend/hooks/useBusyAction.ts";
import { useConfirmDialog } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { type GitHubRepoRef, githubRPCClient, useGitHubIssue, useGitHubLabels } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Bot, ChevronDown, CircleCheck, CircleDot, Pencil, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import type { GitHubItemParams } from "../app.tsx";
import { clearGitHubDraft, draftKey, setGitHubDraft, useGitHubAccount, useGitHubDrafts } from "../lib/githubStore.ts";
import ActionButton from "./ActionButton.tsx";
import CommentComposer from "./CommentComposer.tsx";
import ItemPanelShell from "./ItemPanelShell.tsx";
import { ISSUE_STATE_BADGES, parseLoginList, timeAgo } from "./itemFormat.ts";
import LabelChip from "./LabelChip.tsx";
import LabelPicker from "./LabelPicker.tsx";
import Markdown from "./Markdown.tsx";
import TimelineEntry, { Avatar } from "./TimelineEntry.tsx";
import { useWorkWithAgent } from "./useWorkWithAgent.ts";

interface EditDraft {
  title: string;
  body: string;
  assignees: string;
}

export interface IssuePanelProps {
  owner: string;
  repo: string;
  number: number;
  panel: ViewPanelHandle<GitHubItemParams>;
}

/** One issue: description, comments, and the actions the user can take on it. */
export default function IssuePanel({ owner, repo, number, panel }: IssuePanelProps) {
  const { account, agentTypes, isAuthenticated } = useGitHubAccount();
  const ref = useMemo<GitHubRepoRef>(() => ({ owner, repo, ...(account ? { account } : {}) }), [account, owner, repo]);
  const query = useGitHubIssue(ref, number);
  const labels = useGitHubLabels(ref);
  const issue = query.data?.issue ?? null;
  const comments = query.data?.comments ?? [];
  const { mutate: globalMutate } = useSWRConfig();
  const { busy: startingAgent, workWithAgent } = useWorkWithAgent(agentTypes);
  const { busy: commenting, execute: executeComment } = useBusyAction();
  const { busy: updating, execute: executeUpdate } = useBusyAction();
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const { openConfirm, Dialog: ConfirmDialog } = useConfirmDialog();

  const key = draftKey(owner, repo, "issue", number);
  const draft = useGitHubDrafts().get(key) ?? "";

  const refreshLists = useCallback(() => {
    void globalMutate(candidate => typeof candidate === "string" && candidate.startsWith("/github/issues/"), undefined, { revalidate: true });
  }, [globalMutate]);

  // The tab is named after the issue once it loads.
  useEffect(() => {
    panel.setTitle(issue ? `#${number} ${issue.title}` : `Issue #${number}`);
  }, [issue, number, panel]);

  // An unsent comment earns an amber dot on the tab, so a hidden panel still shows it has work in it.
  useEffect(() => {
    setPanelBadge(panel.panelId, draft ? { tone: "warning", title: "Unsent comment" } : null);
  }, [draft, panel.panelId]);
  useEffect(() => () => setPanelBadge(panel.panelId, null), [panel.panelId]);

  const submitComment = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    await executeComment(async () => {
      try {
        await githubRPCClient.addIssueComment({ ...ref, issueNumber: number, body });
        clearGitHubDraft(key);
        toastManager.success("Comment posted", { duration: 2500 });
        void query.mutate();
        refreshLists();
      } catch (error) {
        toastManager.error(formatError(error), { duration: 6000 });
      }
    });
  }, [draft, executeComment, key, number, query.mutate, ref, refreshLists]);

  type UpdateArgs = Omit<Parameters<typeof githubRPCClient.updateIssue>[0], "owner" | "repo" | "account" | "issueNumber">;
  const update = useCallback(
    async (patch: UpdateArgs, done: string) => {
      await executeUpdate(async () => {
        try {
          await githubRPCClient.updateIssue({ ...ref, issueNumber: number, ...patch });
          toastManager.success(done, { duration: 2500 });
          void query.mutate();
          refreshLists();
        } catch (error) {
          toastManager.error(formatError(error), { duration: 6000 });
        }
      });
    },
    [executeUpdate, number, query.mutate, ref, refreshLists],
  );

  /** Closing is a one-way trip for watchers (it notifies them), so it is confirmed with the chosen reason. */
  const closeIssue = useCallback(
    async (reason: "completed" | "not_planned") => {
      const label = reason === "completed" ? "completed" : "not planned";
      const confirmed = await openConfirm({
        id: "github-close-issue",
        title: `Close issue #${number}?`,
        message: `Close #${number} as ${label}? Subscribers are notified; you can reopen it later.`,
        confirmText: `Close as ${label}`,
        cancelText: "Keep open",
        variant: "danger",
        dontAskAgain: false,
      });
      if (!confirmed) return;
      await update({ state: "closed", stateReason: reason }, `Issue closed as ${label}`);
    },
    [number, openConfirm, update],
  );

  const toggleLabel = useCallback(
    async (name: string, currentlySelected: boolean) => {
      await executeUpdate(async () => {
        try {
          if (currentlySelected) await githubRPCClient.removeLabel({ ...ref, issueNumber: number, label: name });
          else await githubRPCClient.addLabels({ ...ref, issueNumber: number, labels: [name] });
          void query.mutate();
          refreshLists();
        } catch (error) {
          toastManager.error(formatError(error), { duration: 6000 });
        }
      });
    },
    [executeUpdate, number, query.mutate, ref, refreshLists],
  );

  const saveEdit = useCallback(async () => {
    if (!edit || !issue) return;
    const title = edit.title.trim();
    if (!title) {
      toastManager.error("Title is required", { duration: 3000 });
      return;
    }
    const assignees = parseLoginList(edit.assignees);
    await update(
      {
        ...(title !== issue.title ? { title } : {}),
        ...(edit.body !== (issue.body ?? "") ? { body: edit.body } : {}),
        ...(assignees.join(",") !== issue.assignees.map(user => user.login).join(",") ? { assignees } : {}),
      },
      "Issue updated",
    );
    setEdit(null);
  }, [edit, issue, update]);

  const inputClass = "w-full bg-input border border-primary rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus-accent";

  return (
    <ItemPanelShell
      owner={owner}
      repo={repo}
      number={number}
      kindLabel="Issue"
      htmlUrl={issue?.html_url}
      loading={query.isLoading}
      error={query.error}
      loaded={issue !== null}
      onRefresh={() => void query.mutate()}
      onClose={() => panel.close()}
      header={
        issue && (
          <>
            {edit ? (
              <div className="space-y-2">
                <label htmlFor={`issue-title-${number}`} className="sr-only">
                  Title
                </label>
                <input
                  id={`issue-title-${number}`}
                  value={edit.title}
                  onChange={event => setEdit({ ...edit, title: event.target.value })}
                  className={inputClass}
                />
                <label htmlFor={`issue-assignees-${number}`} className="text-xs font-semibold text-muted uppercase tracking-wider block">
                  Assignees <span className="font-normal normal-case tracking-normal">(comma-separated logins)</span>
                </label>
                <input
                  id={`issue-assignees-${number}`}
                  value={edit.assignees}
                  onChange={event => setEdit({ ...edit, assignees: event.target.value })}
                  placeholder="octocat, hubot"
                  className={inputClass}
                />
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-primary leading-snug flex-1 min-w-0">
                  {issue.title} <span className="text-muted font-normal">#{issue.number}</span>
                </h2>
                <StatusBadge status={issue.state} statuses={ISSUE_STATE_BADGES} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <Avatar user={issue.author} size="sm" />
                <span className="text-primary font-medium">{issue.author?.login ?? "ghost"}</span> opened {timeAgo(issue.created_at)}
              </span>
              <span>· updated {timeAgo(issue.updated_at)}</span>
              {issue.closed_at && <span>· closed {timeAgo(issue.closed_at)}</span>}
              {issue.assignees.length > 0 && <span>· assigned to {issue.assignees.map(user => user.login).join(", ")}</span>}
              {issue.milestone && <span>· milestone {issue.milestone.title}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {issue.labels.map(label => (
                <LabelChip key={label.name} label={label} {...(isAuthenticated ? { onRemove: () => void toggleLabel(label.name, true) } : {})} />
              ))}
              {isAuthenticated && (
                <LabelPicker
                  available={labels.data?.labels}
                  loading={labels.isLoading}
                  selected={issue.labels.map(label => label.name)}
                  busy={updating}
                  onToggle={(name, selected) => void toggleLabel(name, selected)}
                />
              )}
              {issue.labels.length === 0 && !isAuthenticated && <span className="text-xs text-muted">No labels</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {edit ? (
                <>
                  <ActionButton variant="primary" icon={Save} busy={updating} busyLabel="Saving…" disabled={!edit.title.trim()} onClick={() => void saveEdit()}>
                    Save
                  </ActionButton>
                  <ActionButton onClick={() => setEdit(null)} disabled={updating}>
                    Cancel
                  </ActionButton>
                </>
              ) : (
                <>
                  {isAuthenticated && (
                    <ActionButton
                      icon={Pencil}
                      onClick={() => setEdit({ title: issue.title, body: issue.body ?? "", assignees: issue.assignees.map(user => user.login).join(", ") })}
                    >
                      Edit
                    </ActionButton>
                  )}
                  {isAuthenticated &&
                    (issue.state === "open" ? (
                      <InlineDropdown
                        header="Close as"
                        width="w-56"
                        closeOnSelect
                        disabled={updating}
                        triggerClassName="hover:text-red-500 hover:border-red-500/40"
                        trigger={
                          <>
                            <CircleCheck className="w-3.5 h-3.5" />
                            {updating ? "Closing…" : "Close issue"}
                            <ChevronDown className="w-3 h-3" />
                          </>
                        }
                      >
                        <InlineDropdownItem trailing={null} onClick={() => void closeIssue("completed")}>
                          Close as completed
                        </InlineDropdownItem>
                        <InlineDropdownItem trailing={null} onClick={() => void closeIssue("not_planned")}>
                          Close as not planned
                        </InlineDropdownItem>
                      </InlineDropdown>
                    ) : (
                      <ActionButton
                        icon={CircleDot}
                        variant="success"
                        busy={updating}
                        busyLabel="Reopening…"
                        onClick={() => void update({ state: "open", stateReason: "reopened" }, "Issue reopened")}
                      >
                        Reopen
                      </ActionButton>
                    ))}
                  <ActionButton
                    icon={Bot}
                    busy={startingAgent}
                    busyLabel="Opening…"
                    onClick={() => void workWithAgent("issue", owner, repo, number, issue.title)}
                  >
                    Work with agent
                  </ActionButton>
                </>
              )}
            </div>
          </>
        )
      }
    >
      {issue && (
        <div className="space-y-3 max-w-3xl">
          {edit ? (
            <>
              <label htmlFor={`issue-body-${number}`} className="text-xs font-semibold text-muted uppercase tracking-wider block">
                Description <span className="font-normal normal-case tracking-normal">(Markdown)</span>
              </label>
              <textarea
                id={`issue-body-${number}`}
                value={edit.body}
                onChange={event => setEdit({ ...edit, body: event.target.value })}
                rows={14}
                className={`${inputClass} resize-y min-h-48 font-mono`}
              />
            </>
          ) : (
            <TimelineEntry author={issue.author} createdAt={issue.created_at} htmlUrl={issue.html_url}>
              {issue.body ? <Markdown>{issue.body}</Markdown> : <p className="text-sm text-muted italic">No description provided.</p>}
            </TimelineEntry>
          )}

          {comments.length > 0 && (
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider pt-2">
              {issue.comments > comments.length
                ? `First ${comments.length} of ${issue.comments} comments`
                : `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
            </h3>
          )}
          {comments.map(comment => (
            <TimelineEntry key={comment.id} author={comment.author} createdAt={comment.created_at} htmlUrl={comment.html_url}>
              <Markdown>{comment.body}</Markdown>
            </TimelineEntry>
          ))}

          {issue.comments > comments.length && (
            <p className="text-xs text-muted rounded-lg border border-dashed border-primary px-3 py-2">
              Only the first {comments.length} comments are shown.{" "}
              <a href={issue.html_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-soft focus-ring">
                Read the rest on GitHub →
              </a>
            </p>
          )}

          {isAuthenticated ? (
            <CommentComposer
              value={draft}
              onChange={value => setGitHubDraft(key, value)}
              onSubmit={() => void submitComment()}
              busy={commenting}
              disabled={issue.locked}
            />
          ) : (
            <p className="text-xs text-muted">Connect a GitHub account to comment.</p>
          )}
        </div>
      )}
      <ConfirmDialog />
    </ItemPanelShell>
  );
}
