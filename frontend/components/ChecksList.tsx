import type { GitHubPRStatus } from "@tokenring-ai/github/pullRequestTypes";
import EmptyState from "@tokenring-ai/one-frontend/components/ui/EmptyState.tsx";
import StatusBadge from "@tokenring-ai/one-frontend/components/ui/StatusBadge.tsx";
import { ExternalLink } from "lucide-react";
import { CHECK_STATE_BADGES, timeAgo } from "./itemFormat.ts";

/** Commit statuses and check runs for a pull request's head commit. */
export default function ChecksList({ status }: { status: GitHubPRStatus }) {
  if (status.statuses.length === 0) {
    return <EmptyState variant="inline" title="No checks reported" hint={`Nothing has run against ${status.sha.slice(0, 7)} yet.`} />;
  }

  return (
    <ul aria-label="Checks" className="divide-y divide-primary">
      {status.statuses.map(check => (
        <li key={`${check.source}:${check.context}`} className="flex items-center gap-3 px-1 py-2 text-sm">
          <StatusBadge status={check.state} statuses={CHECK_STATE_BADGES} variant="inline" className="shrink-0 w-24" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-primary truncate">{check.context}</span>
              <span className="text-[10px] uppercase tracking-wider text-dim shrink-0">{check.source === "check_run" ? "check" : "status"}</span>
            </div>
            {check.description && <p className="text-xs text-muted truncate">{check.description}</p>}
          </div>
          {check.updated_at && <span className="text-xs text-muted shrink-0">{timeAgo(check.updated_at)}</span>}
          {check.target_url && (
            <a
              href={check.target_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-primary transition-colors shrink-0"
              title="Open details"
              aria-label={`Open ${check.context}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
