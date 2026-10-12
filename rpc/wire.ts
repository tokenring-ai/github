/**
 * zod mirrors of the GitHub domain types, for the RPC wire contract.
 *
 * The domain types in `types.ts` and `pullRequestTypes.ts` are plain TypeScript
 * because their normalizers predate the RPC layer, and the RPC transport
 * parses every result against a zod schema. Rather than rewrite the
 * normalizers, each schema here mirrors its type and `wireSchemasMatchDomainTypes`
 * fails to compile the moment the two drift apart.
 */

import { z } from "zod";
import type { GitHubRepoSearchResult, GitHubRepository } from "../GitHubService.ts";
import type {
  GitHubAutoMerge,
  GitHubBranch,
  GitHubPRCheck,
  GitHubPRComment,
  GitHubPRFileChange,
  GitHubPRMergeResult,
  GitHubPRRef,
  GitHubPRReview,
  GitHubPRStatus,
  GitHubPullRequest,
  GitHubTeam,
} from "../pullRequestTypes.ts";
import type { GitHubIssue, GitHubIssueComment, GitHubLabel, GitHubMilestone, GitHubReactions, GitHubUser } from "../types.ts";

export const GitHubUserSchema = z.object({
  login: z.string(),
  id: z.number(),
  avatar_url: z.string(),
  html_url: z.string(),
  type: z.enum(["User", "Organization"]),
});

export const GitHubLabelSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
  description: z.string().nullable(),
});

export const GitHubMilestoneSchema = z.object({
  number: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  state: z.enum(["open", "closed"]),
  due_on: z.string().optional(),
  open_issues: z.number(),
  closed_issues: z.number(),
});

export const GitHubReactionsSchema = z.object({
  total_count: z.number(),
  plus_one: z.number(),
  minus_one: z.number(),
  laugh: z.number(),
  confused: z.number(),
  hooray: z.number(),
  heart: z.number(),
  rocket: z.number(),
  eyes: z.number(),
});

export const GitHubIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  locked: z.boolean(),
  body: z.string().nullable(),
  labels: z.array(GitHubLabelSchema),
  assignees: z.array(GitHubUserSchema),
  milestone: GitHubMilestoneSchema.optional(),
  comments: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().optional(),
  html_url: z.string(),
  author: GitHubUserSchema.nullable(),
  reactions: GitHubReactionsSchema.optional(),
  isPullRequest: z.boolean(),
  repository: z.string().optional(),
});

export const GitHubIssueCommentSchema = z.object({
  id: z.number(),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  author: GitHubUserSchema.nullable(),
  reactions: GitHubReactionsSchema.optional(),
});

export const GitHubTeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
});

export const GitHubPRRefSchema = z.object({
  label: z.string(),
  ref: z.string(),
  sha: z.string(),
  user: GitHubUserSchema.optional(),
  repository: z.string().optional(),
});

export const GitHubAutoMergeSchema = z.object({
  enabled_by: GitHubUserSchema.nullable(),
  merge_method: z.enum(["merge", "squash", "rebase"]),
  commit_title: z.string(),
  commit_message: z.string(),
});

export const GitHubPullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  draft: z.boolean(),
  locked: z.boolean(),
  body: z.string().nullable(),
  labels: z.array(GitHubLabelSchema),
  assignees: z.array(GitHubUserSchema),
  requested_reviewers: z.array(GitHubUserSchema),
  requested_teams: z.array(GitHubTeamSchema),
  author: GitHubUserSchema.nullable(),
  milestone: GitHubMilestoneSchema.optional(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().optional(),
  merged_at: z.string().optional(),
  merge_commit_sha: z.string().optional(),
  html_url: z.string(),
  diff_url: z.string().optional(),
  patch_url: z.string().optional(),
  head: GitHubPRRefSchema,
  base: GitHubPRRefSchema,
  auto_merge: GitHubAutoMergeSchema.optional(),
  maintainer_can_modify: z.boolean().optional(),
  reactions: GitHubReactionsSchema.optional(),
  repository: z.string().optional(),
  merged: z.boolean().optional(),
  mergeable: z.boolean().nullable().optional(),
  mergeable_state: z.string().optional(),
  rebaseable: z.boolean().nullable().optional(),
  merged_by: GitHubUserSchema.nullable().optional(),
  commits: z.number().optional(),
  additions: z.number().optional(),
  deletions: z.number().optional(),
  changed_files: z.number().optional(),
  comments: z.number().optional(),
  review_comments: z.number().optional(),
});

export const GitHubPRFileChangeSchema = z.object({
  sha: z.string(),
  filename: z.string(),
  status: z.enum(["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"]),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  blob_url: z.string(),
  raw_url: z.string(),
  contents_url: z.string(),
  patch: z.string().optional(),
  previous_filename: z.string().optional(),
});

export const GitHubPRReviewSchema = z.object({
  id: z.number(),
  author: GitHubUserSchema.nullable(),
  body: z.string().nullable(),
  state: z.enum(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED", "PENDING"]),
  submitted_at: z.string().nullable(),
  commit_id: z.string().nullable(),
  html_url: z.string(),
});

export const GitHubPRCommentSchema = z.object({
  id: z.number(),
  kind: z.enum(["review", "conversation"]),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  html_url: z.string(),
  author: GitHubUserSchema.nullable(),
  reactions: GitHubReactionsSchema.optional(),
  path: z.string().optional(),
  position: z.number().nullable().optional(),
  line: z.number().nullable().optional(),
  original_line: z.number().nullable().optional(),
  original_position: z.number().nullable().optional(),
  commit_id: z.string().optional(),
  in_reply_to_id: z.number().optional(),
});

export const GitHubCheckStateSchema = z.enum(["error", "failure", "pending", "success"]);

export const GitHubPRCheckSchema = z.object({
  source: z.enum(["status", "check_run"]),
  context: z.string(),
  description: z.string(),
  state: GitHubCheckStateSchema,
  target_url: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export const GitHubPRStatusSchema = z.object({
  state: GitHubCheckStateSchema,
  sha: z.string(),
  total: z.number(),
  statuses: z.array(GitHubPRCheckSchema),
});

export const GitHubRepoSearchResultSchema = z.object({
  full_name: z.string(),
  description: z.string().nullable(),
  html_url: z.string(),
  stargazers_count: z.number(),
  language: z.string().nullable(),
  default_branch: z.string(),
});

export const GitHubRepositorySchema = GitHubRepoSearchResultSchema.extend({
  name: z.string(),
});

export const GitHubMergeMethodSchema = z.enum(["merge", "squash", "rebase"]);

export const GitHubPRMergeResultSchema = z.object({
  merged: z.boolean(),
  message: z.string(),
  sha: z.string(),
});

export const GitHubBranchSchema = z.object({
  name: z.string(),
  protected: z.boolean(),
});

/** `true` only when both types are assignable to each other. */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type WireSchemaChecks = [
  Mutual<GitHubUser, z.infer<typeof GitHubUserSchema>>,
  Mutual<GitHubLabel, z.infer<typeof GitHubLabelSchema>>,
  Mutual<GitHubMilestone, z.infer<typeof GitHubMilestoneSchema>>,
  Mutual<GitHubReactions, z.infer<typeof GitHubReactionsSchema>>,
  Mutual<GitHubIssue, z.infer<typeof GitHubIssueSchema>>,
  Mutual<GitHubIssueComment, z.infer<typeof GitHubIssueCommentSchema>>,
  Mutual<GitHubTeam, z.infer<typeof GitHubTeamSchema>>,
  Mutual<GitHubPRRef, z.infer<typeof GitHubPRRefSchema>>,
  Mutual<GitHubAutoMerge, z.infer<typeof GitHubAutoMergeSchema>>,
  Mutual<GitHubPullRequest, z.infer<typeof GitHubPullRequestSchema>>,
  Mutual<GitHubPRFileChange, z.infer<typeof GitHubPRFileChangeSchema>>,
  Mutual<GitHubPRReview, z.infer<typeof GitHubPRReviewSchema>>,
  Mutual<GitHubPRComment, z.infer<typeof GitHubPRCommentSchema>>,
  Mutual<GitHubPRCheck, z.infer<typeof GitHubPRCheckSchema>>,
  Mutual<GitHubPRStatus, z.infer<typeof GitHubPRStatusSchema>>,
  Mutual<GitHubRepoSearchResult, z.infer<typeof GitHubRepoSearchResultSchema>>,
  Mutual<GitHubRepository, z.infer<typeof GitHubRepositorySchema>>,
  Mutual<GitHubPRMergeResult, z.infer<typeof GitHubPRMergeResultSchema>>,
  Mutual<GitHubBranch, z.infer<typeof GitHubBranchSchema>>,
];

/**
 * Compile-time drift guard. This assignment stops type-checking as soon as a
 * schema above and its domain type disagree: the offending check becomes
 * `false`, the tuple no longer extends `true[]`, and `true` no longer fits.
 */
export const wireSchemasMatchDomainTypes: WireSchemaChecks extends true[] ? true : never = true;
