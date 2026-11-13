import { usePanelBadge, usePanelTitle } from "@tokenring-ai/one-frontend/apps/panelHooks.ts";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import FormActionBar from "@tokenring-ai/one-frontend/components/ui/FormActionBar.tsx";
import { useBusyAction } from "@tokenring-ai/one-frontend/hooks/useBusyAction.ts";
import { useConfirmDialog } from "@tokenring-ai/one-frontend/hooks/useConfirmDialog.tsx";
import { useKeyboardShortcuts } from "@tokenring-ai/one-frontend/hooks/useKeyboardShortcuts.ts";
import { useLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { usePanel } from "@tokenring-ai/one-frontend/layout/hooks.ts";
import { type GitHubRepoRef, githubRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import { Checkbox, Select, TextArea, TextField, toastManager, ViewHeader, ViewShell } from "@tokenring-ai/one-frontend/ui";
import formatError from "@tokenring-ai/utility/error/formatError";
import { GitPullRequest, GitPullRequestCreate, X } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";
import { GITHUB_GRADIENT } from "../ids.ts";
import { useGitHubBranches, useGitHubRepository } from "../lib/githubQueries.ts";
import { newPullDraftKey, useGitHubAccount, useGitHubRepo } from "../lib/githubStore.ts";
import { useGitHubLayoutNavigation } from "../lib/useGitHubLayoutNavigation.ts";

interface NewPullDraft {
  title: string;
  body: string;
  /** Source branch; `owner:branch` for a fork. */
  head: string;
  /** Target branch; empty means the repository's default branch. */
  base: string;
  draft: boolean;
}

const EMPTY: NewPullDraft = { title: "", body: "", head: "", base: "", draft: false };

/** The base branch and draft flag are settings, not content: losing them loses nothing typed. */
function isDirty(draft: NewPullDraft): boolean {
  return Boolean(draft.title.trim() || draft.body.trim() || draft.head.trim());
}

interface BranchFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  branches: { name: string }[] | undefined;
  /** Typed instead of picked: branches failed to load, or a fork's `owner:branch`. */
  freeText: boolean;
  disabled: boolean;
  placeholder: string;
}

function BranchField({ label, value, onChange, branches, freeText, disabled, placeholder }: BranchFieldProps) {
  if (freeText || !branches) {
    return <TextField label={label} value={value} onChange={onChange} disabled={disabled} placeholder={placeholder} mono className="flex-1" />;
  }
  // Keep a value that is not (or no longer) a listed branch selectable, so the draft is never silently changed.
  const names = branches.map(branch => branch.name);
  return (
    <Select label={label} value={value} onChange={onChange} disabled={disabled} className="flex-1">
      <option value="">{placeholder}</option>
      {value && !names.includes(value) && <option value={value}>{value}</option>}
      {names.map(name => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </Select>
  );
}

/**
 * New-pull-request form (`/github/:owner/:repo/pulls/new`). Creating the pull
 * request closes this panel and opens it. Like the new-issue form, the draft is
 * persisted per repository and the tab is badged while it holds unsent text.
 */
export default function GitHubPullCreatePane({ params }: ViewProps) {
  const panel = usePanel();
  const { repo: selectedRepo } = useGitHubRepo();
  const { account } = useGitHubAccount();
  const repo = useMemo<GitHubRepoRef | null>(() => {
    if (params.owner && params.repo) return { owner: params.owner, repo: params.repo, ...(account ? { account } : {}) };
    return selectedRepo;
  }, [account, params.owner, params.repo, selectedRepo]);
  const { openItem } = useGitHubLayoutNavigation();
  const { mutate: globalMutate } = useSWRConfig();
  const branches = useGitHubBranches(repo);
  const repository = useGitHubRepository(repo);
  const [draft, setDraft] = useLocalStorageState<NewPullDraft>(repo ? newPullDraftKey(repo.owner, repo.repo) : "github:new-pull:none", EMPTY);
  const [freeText, setFreeText] = useLocalStorageState<boolean>("github:new-pull:free-text", false);
  const { busy: creating, execute } = useBusyAction();
  const { openConfirm, Dialog: ConfirmDialog } = useConfirmDialog();
  const dirty = repo !== null && isDirty(draft);

  const defaultBranch = repository.data?.repository.default_branch ?? "";
  const base = draft.base || defaultBranch;
  const branchList = branches.data?.branches;
  const typeBranches = freeText || Boolean(branches.error);
  const sameBranch = Boolean(draft.head) && draft.head === base;

  usePanelTitle(repo ? `New PR · ${repo.repo}` : "New pull request");
  usePanelBadge(dirty ? { tone: "warning", label: "Unsaved pull request draft" } : null);

  const canCreate = Boolean(draft.title.trim() && draft.head.trim() && base.trim()) && !sameBranch;

  const handleCreate = useCallback(async () => {
    if (!repo) return;
    const title = draft.title.trim();
    const head = draft.head.trim();
    if (!title || !head || !base.trim()) {
      toastManager.error("Title, head branch and base branch are required", { duration: 3000 });
      return;
    }
    if (head === base) {
      toastManager.error("Head and base must be different branches", { duration: 3000 });
      return;
    }
    const sent = draft;
    await execute(async () => {
      try {
        const body = sent.body.trim();
        const { pullRequest } = await githubRPCClient.createPullRequest({
          owner: repo.owner,
          repo: repo.repo,
          ...(repo.account ? { account: repo.account } : {}),
          title,
          head,
          base: base.trim(),
          ...(body ? { body } : {}),
          ...(sent.draft ? { draft: true } : {}),
        });
        toastManager.success(`Pull request #${pullRequest.number} opened`, { duration: 3000 });
        // Only drop the draft if nothing was typed while the request was in flight.
        setDraft(current => (JSON.stringify(current) === JSON.stringify(sent) ? EMPTY : current));
        void globalMutate(key => typeof key === "string" && key.startsWith("/github/pulls/"), undefined, { revalidate: true });
        openItem("pull", pullRequest.number, { owner: repo.owner, repo: repo.repo });
        panel.close();
      } catch (error) {
        toastManager.error(formatError(error), { duration: 6000 });
      }
    });
  }, [base, draft, execute, globalMutate, openItem, panel, repo, setDraft]);

  /** Discarding wipes the persisted draft, so a non-empty one is confirmed first. */
  const handleDiscard = useCallback(async () => {
    if (dirty) {
      const confirmed = await openConfirm({
        id: "github-discard-pull-draft",
        title: "Discard pull request draft?",
        message: "This pull request has not been opened. Discarding it removes the title, description and branches you entered.",
        confirmText: "Discard draft",
        cancelText: "Keep draft",
        variant: "warning",
      });
      if (!confirmed) return;
    }
    setDraft(EMPTY);
    panel.close();
  }, [dirty, openConfirm, panel, setDraft]);

  useKeyboardShortcuts([{ key: "s", allowInEditable: true, enabled: panel.isActive && !creating && canCreate, handler: () => void handleCreate() }]);

  if (!repo) {
    return (
      <EmptyState
        variant="page"
        className="h-full bg-primary"
        icon={GitPullRequest}
        title="No repository selected"
        hint="Pick a repository in the list, then open a new pull request."
        ctaLabel="Close panel"
        ctaIcon={X}
        onCta={() => panel.close()}
      />
    );
  }

  const update = (patch: Partial<NewPullDraft>) => setDraft(previous => ({ ...previous, ...patch }));

  return (
    <ViewShell
      pad="page"
      width="prose"
      header={
        <ViewHeader
          variant="panel"
          icon={GitPullRequestCreate}
          iconGradient={GITHUB_GRADIENT}
          title="New pull request"
          subtitle={`${repo.owner}/${repo.repo}`}
        />
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <BranchField
            label="Base (merge into)"
            value={base}
            onChange={value => update({ base: value })}
            branches={branchList}
            freeText={typeBranches}
            disabled={creating}
            placeholder={branches.isLoading ? "Loading branches…" : "Choose a base branch"}
          />
          <BranchField
            label="Head (merge from)"
            value={draft.head}
            onChange={value => update({ head: value })}
            branches={branchList}
            freeText={typeBranches}
            disabled={creating}
            placeholder={branches.isLoading ? "Loading branches…" : "Choose a head branch"}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {sameBranch ? (
            <p className="text-danger" role="alert">
              Head and base are the same branch.
            </p>
          ) : branches.error ? (
            <p className="text-muted">Branches could not be loaded; type the branch names.</p>
          ) : (
            <span />
          )}
          {!branches.error && (
            <Checkbox
              id="new-pull-free-text"
              checked={freeText}
              onChange={setFreeText}
              disabled={creating}
              label="Type branch names (for a fork, owner:branch)"
            />
          )}
        </div>

        <TextField
          label="Title"
          value={draft.title}
          onChange={title => update({ title })}
          disabled={creating}
          placeholder="Short, descriptive title"
          size="md"
        />

        <TextArea
          label="Description (Markdown)"
          value={draft.body}
          onChange={body => update({ body })}
          rows={10}
          mono
          size="md"
          disabled={creating}
          placeholder="What changes, why, and how to test it…"
        />

        <Checkbox
          id="new-pull-draft"
          checked={draft.draft}
          onChange={value => update({ draft: value })}
          disabled={creating}
          label="Open as a draft (not ready for review)"
        />

        <FormActionBar
          submitLabel={draft.draft ? "Open draft pull request" : "Open pull request"}
          submitIcon={GitPullRequestCreate}
          loading={creating}
          disabled={!canCreate}
          onSubmit={() => void handleCreate()}
          cancelLabel="Discard"
          onCancel={() => void handleDiscard()}
        />
      </div>
      <ConfirmDialog />
    </ViewShell>
  );
}
