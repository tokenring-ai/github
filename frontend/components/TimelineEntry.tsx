import type { GitHubUser } from "@tokenring-ai/github/types";
import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { timeAgo } from "./itemFormat.ts";

export function Avatar({ user, size = "md" }: { user: GitHubUser | null; size?: "sm" | "md" | undefined }) {
  const dimension = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  if (!user?.avatar_url) {
    return <span className={cn(dimension, "rounded-full bg-tertiary shrink-0")} aria-hidden />;
  }
  return <img src={user.avatar_url} alt="" className={cn(dimension, "rounded-full shrink-0 bg-tertiary")} />;
}

export interface TimelineEntryProps {
  author: GitHubUser | null;
  /** ISO timestamp shown relatively. */
  createdAt: string | null;
  htmlUrl?: string | undefined;
  /** Rendered after the author: a review state, a "review comment" tag, a file path. */
  badge?: ReactNode;
  children: ReactNode;
  className?: string | undefined;
}

/** One comment, review or description in an issue or pull request conversation. */
export default function TimelineEntry({ author, createdAt, htmlUrl, badge, children, className }: TimelineEntryProps) {
  return (
    <article className={cn("rounded-xl border border-primary bg-secondary", className)}>
      <header className="flex items-center gap-2 px-3 py-2 border-b border-primary text-xs">
        <Avatar user={author} size="sm" />
        <span className="font-semibold text-primary truncate">{author?.login ?? "ghost"}</span>
        {badge}
        {createdAt && (
          <span className="text-muted" title={new Date(createdAt).toLocaleString()}>
            {timeAgo(createdAt)}
          </span>
        )}
        {htmlUrl && (
          <a
            href={htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-muted hover:text-primary transition-colors"
            title="Open on GitHub"
            aria-label="Open on GitHub"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </header>
      <div className="px-3 py-2">{children}</div>
    </article>
  );
}
