import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import { CircleDot, FilePlus } from "lucide-react";
import { useGitHubRepo } from "../lib/githubStore.ts";
import { useGitHubLayoutNavigation } from "../lib/useGitHubLayoutNavigation.ts";

/** The "Select an issue or pull request" landing tab at `/github` and `/github/<owner>/<repo>`; closes once an item is opened. */
export default function GitHubStartPane() {
  const { openNewIssue } = useGitHubLayoutNavigation();
  const { repo } = useGitHubRepo();

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
