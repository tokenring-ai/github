import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import type { ViewPanelHandle, ViewProps } from "@tokenring-ai/one-frontend/dock/types.ts";
import { CircleDot, FilePlus } from "lucide-react";
import { useEffect } from "react";
import type { GitHubItemParams } from "../app.tsx";
import IssuePanel from "../components/IssuePanel.tsx";
import PullRequestPanel from "../components/PullRequestPanel.tsx";
import { useGitHubNavigation } from "../lib/githubShared.tsx";
import { useGitHubRepo } from "../lib/githubStore.ts";

/** A panel with no item yet: the main area's placeholder, filled by the next item opened. */
function ItemPlaceholder({ panel }: { panel: ViewPanelHandle<GitHubItemParams> }) {
  const { openNewIssue } = useGitHubNavigation();
  const { repo } = useGitHubRepo();

  useEffect(() => {
    panel.setTitle("Select an issue");
  }, [panel]);

  return (
    <EmptyState
      variant="page"
      className="h-full bg-primary"
      icon={CircleDot}
      iconBadgeClassName="bg-linear-to-br from-slate-600 to-slate-900"
      title="Select an issue or pull request"
      hint={repo ? `Pick one from ${repo.owner}/${repo.repo} to read it, comment, and act on it.` : "Choose a repository in the list to get started."}
      ctaLabel="New issue"
      ctaIcon={FilePlus}
      onCta={openNewIssue}
    />
  );
}

/** One issue or pull request per panel. */
export default function GitHubItemView({ params, panel }: ViewProps<GitHubItemParams>) {
  const { owner, repo, kind, number } = params;
  if (!owner || !repo || !kind || !number) return <ItemPlaceholder panel={panel} />;
  if (kind === "pull") return <PullRequestPanel owner={owner} repo={repo} number={number} panel={panel} />;
  return <IssuePanel owner={owner} repo={repo} number={number} panel={panel} />;
}
