import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import type { GitHubIssue, GitHubIssueComment, GitHubLabel } from "./types.ts";

/** Issue bodies are user-authored and unbounded, so they're capped before display. */
const BODY_MAX_LENGTH = 8_000;
const COMMENT_MAX_LENGTH = 2_000;

function truncateBody(body: string | null, maxLength: number): string {
  if (!body?.trim()) return "_(no description)_";
  return intelligentTruncate(body, { maxLength, suffix: "\n\n… (truncated)" });
}

function labelNames(labels: GitHubLabel[]): string {
  return labels.map(label => label.name).join(", ");
}

/** A compact table of issues; `repository` is included when results span repos. */
export function formatIssueTable(issues: GitHubIssue[]): string {
  if (issues.length === 0) return "No issues found.";

  const spansRepositories = issues.some(issue => issue.repository);
  const columns = [...(spansRepositories ? ["Repository"] : []), "#", "State", "Title", "Labels", "Comments", "Updated"];

  const rows = issues.map(issue => [
    ...(spansRepositories ? [issue.repository ?? ""] : []),
    String(issue.number),
    issue.isPullRequest ? `${issue.state} (PR)` : issue.state,
    issue.title,
    labelNames(issue.labels),
    String(issue.comments),
    issue.updated_at,
  ]);

  return markdownTable(columns, rows);
}

export function formatIssueDetail(issue: GitHubIssue, repositorySlug?: string): string {
  const slug = repositorySlug ?? issue.repository;
  const heading = slug ? `${slug}#${issue.number}` : `#${issue.number}`;

  const lines = [
    `# ${heading}: ${issue.title}`,
    "",
    `State: ${issue.state}${issue.closed_at ? ` (closed ${issue.closed_at})` : ""}${issue.isPullRequest ? " — this is a pull request" : ""}`,
    `Author: ${issue.author?.login ?? "(unknown)"}`,
    `Created: ${issue.created_at}`,
    `Updated: ${issue.updated_at}`,
    `Comments: ${issue.comments}`,
    `Labels: ${labelNames(issue.labels) || "(none)"}`,
    `Assignees: ${issue.assignees.map(user => user.login).join(", ") || "(none)"}`,
  ];

  if (issue.milestone) {
    lines.push(`Milestone: ${issue.milestone.title} (${issue.milestone.state})`);
  }
  if (issue.locked) {
    lines.push("Locked: yes");
  }
  if (issue.reactions && issue.reactions.total_count > 0) {
    lines.push(`Reactions: ${issue.reactions.total_count} (👍 ${issue.reactions.plus_one}, 👎 ${issue.reactions.minus_one}, ❤️ ${issue.reactions.heart})`);
  }

  lines.push(`URL: ${issue.html_url}`, "", "---", "", truncateBody(issue.body, BODY_MAX_LENGTH));

  return lines.join("\n");
}

export function formatComments(comments: GitHubIssueComment[]): string {
  if (comments.length === 0) return "No comments.";

  return comments
    .map(comment =>
      [`### ${comment.author?.login ?? "(unknown)"} — ${comment.created_at}`, comment.html_url, "", truncateBody(comment.body, COMMENT_MAX_LENGTH)].join("\n"),
    )
    .join("\n\n");
}

export function formatLabelTable(labels: GitHubLabel[]): string {
  if (labels.length === 0) return "No labels found.";
  return markdownTable(
    ["Label", "Color", "Description"],
    labels.map(label => [label.name, label.color, label.description ?? ""]),
  );
}

/** One-line summary used in tool result messages and approval prompts. */
export function summarizeIssue(issue: GitHubIssue, repositorySlug?: string): string {
  const slug = repositorySlug ?? issue.repository;
  return `${slug ? `${slug}#` : "#"}${issue.number} ${issue.title}`;
}
