import { usePanelBadge, usePanelTitle } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import FormActionBar from "@tokenring-ai/one-frontend/components/ui/FormActionBar.tsx";
import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { useBusyAction } from "@tokenring-ai/one-frontend/hooks/useBusyAction.ts";
import { useConfirmDialog } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { useKeyboardShortcuts } from "@tokenring-ai/one-frontend/hooks/useKeyboardShortcuts.ts";
import { useLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { type GitHubRepoRef, githubRPCClient, useGitHubLabels } from "@tokenring-ai/one-frontend/rpc.ts";
import { TextArea, TextField } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { CircleDot, FilePlus, X } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";
import { parseLoginList } from "../components/itemFormat.ts";
import LabelChip from "../components/LabelChip.tsx";
import { GITHUB_GRADIENT } from "../ids.ts";
import { newIssueDraftKey, useGitHubAccount, useGitHubRepo } from "../lib/githubStore.ts";
import { useGitHubLayoutNavigation } from "../lib/useGitHubLayoutNavigation.ts";

interface NewIssueDraft {
  title: string;
  body: string;
  labels: string[];
  /** Raw comma-separated input, as typed. */
  assignees: string;
}

const EMPTY: NewIssueDraft = { title: "", body: "", labels: [], assignees: "" };

function isDirty(draft: NewIssueDraft): boolean {
  return Boolean(draft.title.trim() || draft.body.trim() || draft.labels.length > 0 || draft.assignees.trim());
}

/**
 * New-issue form (`/github/:owner/:repo/issues/new`). Creating an issue closes this panel and opens it.
 * The panel's own `owner`/`repo` params (from the URL) name the repository; the
 * navigator's selection is only a fallback for a panel restored without them.
 */
export default function GitHubIssueCreatePane({ params }: ViewProps) {
  const panel = usePanel();
  const { repo: selectedRepo } = useGitHubRepo();
  const { account } = useGitHubAccount();
  const repo = useMemo<GitHubRepoRef | null>(() => {
    if (params.owner && params.repo) return { owner: params.owner, repo: params.repo, ...(account ? { account } : {}) };
    return selectedRepo;
  }, [account, params.owner, params.repo, selectedRepo]);
  const { openItem } = useGitHubLayoutNavigation();
  const { mutate: globalMutate } = useSWRConfig();
  const labels = useGitHubLabels(repo);
  // Persisted per repository so closing the tab (or reloading) does not lose a
  // half-written issue, and a form for another repository never shows it.
  const [draft, setDraft] = useLocalStorageState<NewIssueDraft>(repo ? newIssueDraftKey(repo.owner, repo.repo) : "github:new-issue:none", EMPTY);
  const { busy: creating, execute } = useBusyAction();
  const { openConfirm, Dialog: ConfirmDialog } = useConfirmDialog();
  const dirty = repo !== null && isDirty(draft);

  usePanelTitle(repo ? `New issue · ${repo.repo}` : "New issue");
  usePanelBadge(dirty ? { tone: "warning", label: "Unsaved issue draft" } : null);

  const toggleLabel = useCallback(
    (name: string) =>
      setDraft(previous => ({
        ...previous,
        labels: previous.labels.includes(name) ? previous.labels.filter(label => label !== name) : [...previous.labels, name],
      })),
    [setDraft],
  );

  const handleCreate = useCallback(async () => {
    if (!repo) return;
    const title = draft.title.trim();
    if (!title) {
      toastManager.error("Title is required", { duration: 3000 });
      return;
    }
    await execute(async () => {
      try {
        const assignees = parseLoginList(draft.assignees);
        const body = draft.body.trim();
        const { issue } = await githubRPCClient.createIssue({
          owner: repo.owner,
          repo: repo.repo,
          ...(repo.account ? { account: repo.account } : {}),
          title,
          ...(body ? { body } : {}),
          ...(draft.labels.length > 0 ? { labels: draft.labels } : {}),
          ...(assignees.length > 0 ? { assignees } : {}),
        });
        toastManager.success(`Issue #${issue.number} created`, { duration: 3000 });
        setDraft(EMPTY);
        void globalMutate(key => typeof key === "string" && key.startsWith("/github/issues/"), undefined, { revalidate: true });
        openItem("issue", issue.number, { owner: repo.owner, repo: repo.repo });
        panel.close();
      } catch (error) {
        toastManager.error(formatError(error), { duration: 5000 });
      }
    });
  }, [draft, execute, globalMutate, openItem, panel, repo, setDraft]);

  /** Discarding wipes the persisted draft, so a non-empty one is confirmed first. */
  const handleDiscard = useCallback(async () => {
    if (dirty) {
      const confirmed = await openConfirm({
        id: "github-discard-issue-draft",
        title: "Discard issue draft?",
        message: "This issue has not been created. Discarding it removes the title, description, labels and assignees you entered.",
        confirmText: "Discard draft",
        cancelText: "Keep draft",
        variant: "warning",
      });
      if (!confirmed) return;
    }
    setDraft(EMPTY);
    panel.close();
  }, [dirty, openConfirm, panel, setDraft]);

  // Cmd/Ctrl+S submits, like saving an open item.
  useKeyboardShortcuts([{ key: "s", allowInEditable: true, enabled: panel.isActive && !creating, handler: () => void handleCreate() }]);

  if (!repo) {
    return (
      <EmptyState
        variant="page"
        className="h-full bg-primary"
        icon={CircleDot}
        title="No repository selected"
        hint="Pick a repository in the list, then open a new issue."
        ctaLabel="Close panel"
        ctaIcon={X}
        onCta={() => panel.close()}
      />
    );
  }

  return (
    <ViewShell
      pad="page"
      width="prose"
      header={<ViewHeader variant="panel" icon={FilePlus} iconGradient={GITHUB_GRADIENT} title="New issue" subtitle={`${repo.owner}/${repo.repo}`} />}
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="new-issue-title" className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">
            Title
          </label>
          <TextField
            id="new-issue-title"
            size="md"
            value={draft.title}
            onChange={title => setDraft(previous => ({ ...previous, title }))}
            disabled={creating}
            placeholder="Short, descriptive title"
          />
        </div>

        <div>
          <label htmlFor="new-issue-body" className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">
            Description <span className="font-normal normal-case tracking-normal">(Markdown)</span>
          </label>
          <TextArea
            id="new-issue-body"
            size="md"
            mono
            value={draft.body}
            onChange={body => setDraft(previous => ({ ...previous, body }))}
            rows={10}
            disabled={creating}
            placeholder="What is happening, what should happen, how to reproduce…"
          />
        </div>

        <div>
          <span className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">Labels</span>
          {labels.data && labels.data.labels.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Labels">
              {labels.data.labels.map(label => {
                const selected = draft.labels.includes(label.name);
                return (
                  <button
                    key={label.name}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleLabel(label.name)}
                    disabled={creating}
                    className={`rounded-full transition-opacity cursor-pointer focus-ring ${selected ? "opacity-100 ring-2 ring-accent" : "opacity-50 hover:opacity-90"}`}
                  >
                    <LabelChip label={label} />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted">{labels.isLoading ? "Loading labels…" : "This repository has no labels."}</p>
          )}
        </div>

        <div>
          <label htmlFor="new-issue-assignees" className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">
            Assignees <span className="font-normal normal-case tracking-normal">(comma-separated logins)</span>
          </label>
          <TextField
            id="new-issue-assignees"
            size="md"
            value={draft.assignees}
            onChange={assignees => setDraft(previous => ({ ...previous, assignees }))}
            disabled={creating}
            placeholder="octocat, hubot"
          />
        </div>

        <FormActionBar
          submitLabel="Create issue"
          submitIcon={FilePlus}
          loading={creating}
          disabled={!draft.title.trim()}
          onSubmit={() => void handleCreate()}
          cancelLabel="Discard"
          onCancel={() => void handleDiscard()}
        />
      </div>
      <ConfirmDialog />
    </ViewShell>
  );
}
