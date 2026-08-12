/**
 * Domain types for GitHub issues, plus normalizers that flatten Octokit's
 * response shapes onto them. Octokit types many of these fields as nullable or
 * as unions (labels are `string | object`, `state` is a bare `string`), so the
 * mapping happens once here rather than at every call site.
 */

export type GitHubUser = {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  type: "User" | "Organization";
};

export type GitHubLabel = {
  id: number;
  name: string;
  color: string;
  description: string | null;
};

export type GitHubMilestone = {
  number: number;
  title: string;
  description: string | null;
  state: "open" | "closed";
  due_on?: string | undefined;
  open_issues: number;
  closed_issues: number;
};

export type GitHubReactions = {
  total_count: number;
  plus_one: number;
  minus_one: number;
  laugh: number;
  confused: number;
  hooray: number;
  heart: number;
  rocket: number;
  eyes: number;
};

export type GitHubIssue = {
  number: number;
  title: string;
  state: "open" | "closed";
  locked: boolean;
  body: string | null;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  milestone?: GitHubMilestone | undefined;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at?: string | undefined;
  html_url: string;
  author: GitHubUser | null;
  reactions?: GitHubReactions | undefined;
  /**
   * GitHub's issue endpoints return pull requests as issues. This flags those,
   * so callers can tell the two apart.
   */
  isPullRequest: boolean;
  /** Set on search results, which span repositories. */
  repository?: string | undefined;
};

export type GitHubIssueComment = {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  author: GitHubUser | null;
  reactions?: GitHubReactions | undefined;
};

export type GitHubIssueListOptions = {
  account?: string | undefined;
  state?: "open" | "closed" | "all" | undefined;
  labels?: string[] | undefined;
  sort?: "created" | "updated" | "comments" | undefined;
  order?: "asc" | "desc" | undefined;
  perPage?: number | undefined;
  page?: number | undefined;
  /** ISO date; only issues updated at or after this time are returned. */
  since?: string | undefined;
  assignee?: string | undefined;
  creator?: string | undefined;
  mentioned?: string | undefined;
  milestone?: string | undefined;
  /** GitHub returns pull requests from the issues endpoint; off by default. */
  includePullRequests?: boolean | undefined;
};

export type GitHubIssueSearchOptions = {
  account?: string | undefined;
  sort?: "comments" | "reactions" | "created" | "updated" | undefined;
  order?: "asc" | "desc" | undefined;
  perPage?: number | undefined;
  page?: number | undefined;
};

export type GitHubIssueCreateOptions = {
  account?: string | undefined;
  title: string;
  body?: string | undefined;
  labels?: string[] | undefined;
  assignees?: string[] | undefined;
  milestone?: number | undefined;
};

export type GitHubIssueUpdateOptions = {
  account?: string | undefined;
  title?: string | undefined;
  body?: string | undefined;
  state?: "open" | "closed" | undefined;
  stateReason?: "completed" | "not_planned" | "reopened" | undefined;
  labels?: string[] | undefined;
  assignees?: string[] | undefined;
  milestone?: number | null | undefined;
};

/** The subset of an Octokit user that this package reads. */
type RawUser = {
  login?: string | undefined;
  id?: number | undefined;
  avatar_url?: string | undefined;
  html_url?: string | undefined;
  type?: string | undefined;
} | null;

type RawLabel =
  | string
  | {
      id?: number | undefined;
      name?: string | undefined;
      color?: string | null | undefined;
      description?: string | null | undefined;
    };

type RawReactions =
  | {
      total_count: number;
      "+1": number;
      "-1": number;
      laugh: number;
      confused: number;
      hooray: number;
      heart: number;
      rocket: number;
      eyes: number;
    }
  | undefined;

type RawMilestone = {
  number: number;
  title: string;
  description?: string | null | undefined;
  state?: string | undefined;
  due_on?: string | null | undefined;
  open_issues: number;
  closed_issues: number;
} | null;

type RawIssue = {
  number: number;
  title: string;
  state: string;
  locked: boolean;
  body?: string | null | undefined;
  labels: RawLabel[];
  assignees?: RawUser[] | null | undefined;
  milestone?: RawMilestone | undefined;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at?: string | null | undefined;
  html_url: string;
  user?: RawUser | undefined;
  reactions?: RawReactions;
  pull_request?: unknown;
  repository_url?: string | undefined;
};

type RawComment = {
  id: number;
  body?: string | null | undefined;
  created_at: string;
  updated_at: string;
  html_url: string;
  user?: RawUser | undefined;
  reactions?: RawReactions;
};

export function toGitHubUser(user: RawUser): GitHubUser | null {
  if (!user?.login) return null;
  return {
    login: user.login,
    id: user.id ?? 0,
    avatar_url: user.avatar_url ?? "",
    html_url: user.html_url ?? "",
    type: user.type === "Organization" ? "Organization" : "User",
  };
}

export function toGitHubLabel(label: RawLabel): GitHubLabel {
  // The issues endpoints can return labels as bare name strings.
  if (typeof label === "string") {
    return { id: 0, name: label, color: "", description: null };
  }
  return {
    id: label.id ?? 0,
    name: label.name ?? "",
    color: label.color ?? "",
    description: label.description ?? null,
  };
}

export function toGitHubMilestone(milestone: RawMilestone): GitHubMilestone | undefined {
  if (!milestone) return undefined;
  return {
    number: milestone.number,
    title: milestone.title,
    description: milestone.description ?? null,
    state: milestone.state === "closed" ? "closed" : "open",
    ...(milestone.due_on ? { due_on: milestone.due_on } : {}),
    open_issues: milestone.open_issues,
    closed_issues: milestone.closed_issues,
  };
}

export function toGitHubReactions(reactions: RawReactions): GitHubReactions | undefined {
  if (!reactions) return undefined;
  return {
    total_count: reactions.total_count,
    plus_one: reactions["+1"],
    minus_one: reactions["-1"],
    laugh: reactions.laugh,
    confused: reactions.confused,
    hooray: reactions.hooray,
    heart: reactions.heart,
    rocket: reactions.rocket,
    eyes: reactions.eyes,
  };
}

/** Derives `owner/repo` from the `repository_url` search results carry. */
function repositoryFromUrl(repositoryUrl: string | undefined): string | undefined {
  if (!repositoryUrl) return undefined;
  const match = /\/repos\/([^/]+\/[^/]+)$/.exec(repositoryUrl);
  return match?.[1];
}

export function toGitHubIssue(issue: RawIssue): GitHubIssue {
  const repository = repositoryFromUrl(issue.repository_url);
  const milestone = toGitHubMilestone(issue.milestone ?? null);
  const reactions = toGitHubReactions(issue.reactions);

  return {
    number: issue.number,
    title: issue.title,
    state: issue.state === "closed" ? "closed" : "open",
    locked: issue.locked,
    body: issue.body ?? null,
    labels: issue.labels.map(toGitHubLabel),
    assignees: (issue.assignees ?? []).map(toGitHubUser).filter((user): user is GitHubUser => user !== null),
    ...(milestone ? { milestone } : {}),
    comments: issue.comments,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    ...(issue.closed_at ? { closed_at: issue.closed_at } : {}),
    html_url: issue.html_url,
    author: toGitHubUser(issue.user ?? null),
    ...(reactions ? { reactions } : {}),
    isPullRequest: issue.pull_request !== undefined && issue.pull_request !== null,
    ...(repository ? { repository } : {}),
  };
}

export function toGitHubIssueComment(comment: RawComment): GitHubIssueComment {
  const reactions = toGitHubReactions(comment.reactions);

  return {
    id: comment.id,
    body: comment.body ?? "",
    created_at: comment.created_at,
    updated_at: comment.updated_at,
    html_url: comment.html_url,
    author: toGitHubUser(comment.user ?? null),
    ...(reactions ? { reactions } : {}),
  };
}
