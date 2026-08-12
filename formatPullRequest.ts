import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import type { GitHubPRComment, GitHubPRFileChange, GitHubPRReview, GitHubPRStatus, GitHubPullRequest } from "./pullRequestTypes.ts";
import type { GitHubLabel } from "./types.ts";

/** Pull request bodies are user-authored and unbounded, so they're capped before display. */
const BODY_MAX_LENGTH = 8_000;
const COMMENT_MAX_LENGTH = 2_000;

const CHECK_ICONS: Record<GitHubPRStatus["state"], string> = {
  success: "✅",
  failure: "❌",
  error: "⚠️",
  pending: "⏳",
};

function truncateBody(body: string | null, maxLength: number): string {
  if (!body?.trim()) return "_(no description)_";
  return intelligentTruncate(body, { maxLength, suffix: "\n\n… (truncated)" });
}

function labelNames(labels: GitHubLabel[]): string {
  return labels.map(label => label.name).join(", ");
}

/** `open`, `draft`, `merged`, or `closed` — GitHub's four visible states from two fields. */
export function pullRequestState(pull: GitHubPullRequest): string {
  if (pull.merged_at) return "merged";
  if (pull.state === "closed") return "closed";
  return pull.draft ? "draft" : "open";
}

/** A compact table of pull requests; `repository` is included when results span repos. */
export function formatPRTable(pulls: GitHubPullRequest[]): string {
  if (pulls.length === 0) return "No pull requests found.";

  const spansRepositories = pulls.some(pull => pull.repository);
  const columns = [...(spansRepositories ? ["Repository"] : []), "#", "State", "Title", "Branch", "Labels", "Updated"];

  const rows = pulls.map(pull => [
    ...(spansRepositories ? [pull.repository ?? ""] : []),
    String(pull.number),
    pullRequestState(pull),
    pull.title,
    pull.head.ref ? `${pull.head.ref} → ${pull.base.ref}` : "",
    labelNames(pull.labels),
    pull.updated_at,
  ]);

  return markdownTable(columns, rows);
}

export function formatPRDetail(pull: GitHubPullRequest, repositorySlug?: string): string {
  const slug = repositorySlug ?? pull.repository;
  const heading = slug ? `${slug}#${pull.number}` : `#${pull.number}`;

  const lines = [
    `# ${heading}: ${pull.title}`,
    "",
    `State: ${pullRequestState(pull)}${pull.merged_at ? ` (merged ${pull.merged_at})` : pull.closed_at ? ` (closed ${pull.closed_at})` : ""}`,
    `Author: ${pull.author?.login ?? "(unknown)"}`,
    `Branch: ${pull.head.label || pull.head.ref} → ${pull.base.label || pull.base.ref}`,
    `Created: ${pull.created_at}`,
    `Updated: ${pull.updated_at}`,
    `Labels: ${labelNames(pull.labels) || "(none)"}`,
    `Assignees: ${pull.assignees.map(user => user.login).join(", ") || "(none)"}`,
  ];

  const reviewers = [...pull.requested_reviewers.map(user => user.login), ...pull.requested_teams.map(team => team.slug)];
  if (reviewers.length > 0) {
    lines.push(`Reviewers requested: ${reviewers.join(", ")}`);
  }
  if (pull.milestone) {
    lines.push(`Milestone: ${pull.milestone.title} (${pull.milestone.state})`);
  }

  // These come back only from getPullRequest, so a listed or searched pull
  // request simply omits them rather than reporting zeroes.
  if (pull.changed_files !== undefined) {
    lines.push(`Changes: ${pull.changed_files} file(s), +${pull.additions ?? 0} −${pull.deletions ?? 0} across ${pull.commits ?? 0} commit(s)`);
  }
  if (pull.mergeable !== undefined) {
    const mergeable = pull.mergeable === null ? "still being computed" : pull.mergeable ? "yes" : "no";
    lines.push(`Mergeable: ${mergeable}${pull.mergeable_state ? ` (${pull.mergeable_state})` : ""}`);
  }
  if (pull.locked) {
    lines.push("Locked: yes");
  }
  if (pull.auto_merge) {
    lines.push(`Auto-merge: enabled by ${pull.auto_merge.enabled_by?.login ?? "(unknown)"} via ${pull.auto_merge.merge_method}`);
  }

  lines.push(`URL: ${pull.html_url}`, "", "---", "", truncateBody(pull.body, BODY_MAX_LENGTH));

  return lines.join("\n");
}

export function formatPRFiles(files: GitHubPRFileChange[], options: { includePatch?: boolean | undefined } = {}): string {
  if (files.length === 0) return "No changed files.";

  const table = markdownTable(
    ["File", "Status", "+/−"],
    files.map(file => [
      file.previous_filename ? `${file.previous_filename} → ${file.filename}` : file.filename,
      file.status,
      `+${file.additions} −${file.deletions}`,
    ]),
  );

  if (!options.includePatch) return table;

  const patches = files
    .filter(file => file.patch)
    .map(file => `### ${file.filename}\n\n\`\`\`diff\n${file.patch}\n\`\`\``)
    .join("\n\n");

  return patches ? `${table}\n\n${patches}` : table;
}

export function formatPRReviews(reviews: GitHubPRReview[]): string {
  if (reviews.length === 0) return "No reviews.";

  return reviews
    .map(review =>
      [
        `### ${review.author?.login ?? "(unknown)"} — ${review.state}${review.submitted_at ? ` (${review.submitted_at})` : ""}`,
        review.html_url,
        "",
        truncateBody(review.body, COMMENT_MAX_LENGTH),
      ].join("\n"),
    )
    .join("\n\n");
}

export function formatPRComments(comments: GitHubPRComment[]): string {
  if (comments.length === 0) return "No comments.";

  return comments
    .map(comment => {
      // An inline comment is only meaningful with the code location attached.
      const location = comment.path ? ` on ${comment.path}${comment.line ? `:${comment.line}` : ""}` : "";
      return [
        `### ${comment.author?.login ?? "(unknown)"}${location} — ${comment.created_at}`,
        comment.html_url,
        "",
        truncateBody(comment.body, COMMENT_MAX_LENGTH),
      ].join("\n");
    })
    .join("\n\n");
}

export function formatPRStatus(status: GitHubPRStatus): string {
  const heading = `${CHECK_ICONS[status.state]} **${status.state}** — ${status.total} check(s) on ${status.sha.slice(0, 7)}`;
  if (status.statuses.length === 0) {
    return `${heading}\n\nNo status checks or check runs have reported on this commit.`;
  }

  const table = markdownTable(
    ["", "Check", "State", "Details"],
    status.statuses.map(check => [CHECK_ICONS[check.state], check.context, check.state, check.description || check.target_url || ""]),
  );

  return `${heading}\n\n${table}`;
}

export function formatDiff(diff: string, options: { paths?: string[] | undefined } = {}): string {
  if (!diff.trim()) {
    return options.paths?.length ? `No changes in this pull request matched: ${options.paths.join(", ")}` : "This pull request has no changes.";
  }
  return `\`\`\`diff\n${diff}\n\`\`\``;
}

/** One-line summary used in tool result messages and approval prompts. */
export function summarizePullRequest(pull: GitHubPullRequest, repositorySlug?: string): string {
  const slug = repositorySlug ?? pull.repository;
  return `${slug ? `${slug}#` : "#"}${pull.number} ${pull.title}`;
}
