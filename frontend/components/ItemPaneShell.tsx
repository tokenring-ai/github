import ErrorState from "@tokenring-ai/one-frontend/components/ui/ErrorState.tsx";
import LoadingState from "@tokenring-ai/one-frontend/components/ui/LoadingState.tsx";
import ViewHeader from "@tokenring-ai/one-frontend/components/ui/ViewHeader.tsx";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import { Button } from "@tokenring-ai/one-frontend/ui";
import { ExternalLink, GitPullRequest, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { GITHUB_GRADIENT } from "../ids.ts";

export interface ItemPaneShellProps {
  owner: string;
  repo: string;
  number: number;
  kindLabel: "Issue" | "Pull request";
  htmlUrl?: string | undefined;
  loading: boolean;
  error: unknown;
  loaded: boolean;
  onRefresh: () => void;
  onClose: () => void;
  /** The non-scrolling top section: title, meta, actions. */
  header: ReactNode;
  children: ReactNode;
}

/** Frame shared by the issue and pull request panels: header, load/error triage, fixed top, scrolling body. */
export default function ItemPaneShell({
  owner,
  repo,
  number,
  kindLabel,
  htmlUrl,
  loading,
  error,
  loaded,
  onRefresh,
  onClose,
  header,
  children,
}: ItemPaneShellProps) {
  const viewHeader = (
    <ViewHeader
      variant="panel"
      icon={GitPullRequest}
      iconGradient={GITHUB_GRADIENT}
      title={`${kindLabel} #${number}`}
      subtitle={`${owner}/${repo}`}
      actions={[
        ...(htmlUrl
          ? [
              {
                key: "open",
                icon: <ExternalLink className="w-3.5 h-3.5" />,
                label: "Open on GitHub",
                title: "Open on GitHub",
                onClick: () => window.open(htmlUrl, "_blank", "noopener,noreferrer"),
              },
            ]
          : []),
        { key: "refresh", icon: <RefreshCw className="w-3.5 h-3.5" />, label: `Refresh ${kindLabel.toLowerCase()}`, title: "Refresh", onClick: onRefresh },
      ]}
    />
  );

  if (!loaded) {
    return (
      <ViewShell header={viewHeader}>
        {loading ? (
          <LoadingState message={`Loading ${kindLabel.toLowerCase()} #${number}…`} className="h-full" />
        ) : (
          <ErrorState
            title={`${kindLabel} #${number} could not be loaded`}
            error={error ?? new Error("Not found")}
            onRetry={onRefresh}
            variant="page"
            retryLabel="Try again"
          />
        )}
        {!loading && (
          <div className="flex justify-center pb-6">
            <Button variant="ghost" onClick={onClose}>
              Close panel
            </Button>
          </div>
        )}
      </ViewShell>
    );
  }

  return (
    <ViewShell scroll={false} header={viewHeader}>
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-primary space-y-3">{header}</div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      {error ? <ErrorState title="Failed to refresh" error={error} onRetry={onRefresh} variant="inline" /> : null}
    </ViewShell>
  );
}
