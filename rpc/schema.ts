import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { SuccessSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { GitHubStoredTokenSchema } from "../schema.ts";
import {
  GitHubBranchSchema,
  GitHubIssueCommentSchema,
  GitHubIssueSchema,
  GitHubLabelSchema,
  GitHubMergeMethodSchema,
  GitHubPRCommentSchema,
  GitHubPRFileChangeSchema,
  GitHubPRMergeResultSchema,
  GitHubPRReviewSchema,
  GitHubPRStatusSchema,
  GitHubPullRequestSchema,
  GitHubRepoSearchResultSchema,
  GitHubRepositorySchema,
} from "./wire.ts";

/** Every repository-scoped call names the repository and may pick the account it runs as. */
const RepositoryInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  account: z.string().exactOptional(),
});

const IssueInputSchema = RepositoryInputSchema.extend({
  issueNumber: z.number().int().positive(),
});

const PullRequestInputSchema = RepositoryInputSchema.extend({
  prNumber: z.number().int().positive(),
});

/** What the dashboard may know about an account: never its token. */
export const GitHubAccountStatusSchema = z.object({
  name: z.string(),
  login: z.string().optional(),
  baseUrl: z.string(),
  scopes: z.array(z.string()),
  isAuthenticated: z.boolean(),
  usesPersonalAccessToken: z.boolean(),
  grantedScopes: z.array(z.string()).optional(),
  profile: GitHubStoredTokenSchema.shape.profile,
});

export const GitHubStatusSchema = z.object({
  /** Whether OAuth app credentials are configured, i.e. whether "Connect" can work at all. */
  hasOAuthClient: z.boolean(),
  defaultAccount: z.string().optional(),
  agentTypes: z.array(z.string()),
  accounts: z.array(GitHubAccountStatusSchema),
});

export const WorkspaceRepositorySchema = z.object({
  host: z.string(),
  owner: z.string(),
  repo: z.string(),
  remoteUrl: z.string(),
});

export default {
  name: "GitHub RPC",
  path: "/rpc/github",
  methods: {
    getStatus: {
      type: "query",
      input: z.object({}),
      result: GitHubStatusSchema,
    },
    beginAuthorization: {
      type: "mutation",
      input: z.object({ account: z.string().min(1) }),
      result: z.object({ authorizationUrl: z.string(), redirectUri: z.string() }),
    },
    revokeAuthorization: {
      type: "mutation",
      input: z.object({ account: z.string().min(1) }),
      result: SuccessSchema,
    },
    getWorkspaceRepository: {
      type: "query",
      input: z.object({}),
      result: z.object({ repository: WorkspaceRepositorySchema.nullable() }),
    },
    searchRepositories: {
      type: "query",
      input: z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(50).exactOptional(),
        account: z.string().exactOptional(),
      }),
      result: z.object({ repositories: z.array(GitHubRepoSearchResultSchema) }),
    },
    getRepository: {
      type: "query",
      input: RepositoryInputSchema,
      result: z.object({ repository: GitHubRepositorySchema }),
    },
    listBranches: {
      type: "query",
      input: RepositoryInputSchema.extend({
        page: z.number().int().positive().exactOptional(),
        perPage: z.number().int().positive().max(100).exactOptional(),
      }),
      result: z.object({ branches: z.array(GitHubBranchSchema) }),
    },
    listIssues: {
      type: "query",
      input: RepositoryInputSchema.extend({
        state: z.enum(["open", "closed", "all"]).exactOptional(),
        labels: z.array(z.string()).exactOptional(),
        assignee: z.string().exactOptional(),
        creator: z.string().exactOptional(),
        mentioned: z.string().exactOptional(),
        milestone: z.string().exactOptional(),
        since: z.string().exactOptional(),
        sort: z.enum(["created", "updated", "comments"]).exactOptional(),
        order: z.enum(["asc", "desc"]).exactOptional(),
        page: z.number().int().positive().exactOptional(),
        perPage: z.number().int().positive().max(100).exactOptional(),
        includePullRequests: z.boolean().exactOptional(),
      }),
      result: z.object({ issues: z.array(GitHubIssueSchema) }),
    },
    getIssue: {
      type: "query",
      input: IssueInputSchema.extend({
        commentLimit: z.number().int().positive().max(100).exactOptional(),
      }),
      result: z.object({ issue: GitHubIssueSchema, comments: z.array(GitHubIssueCommentSchema) }),
    },
    searchIssues: {
      type: "query",
      input: z.object({
        query: z.string().min(1),
        sort: z.enum(["comments", "reactions", "created", "updated"]).exactOptional(),
        order: z.enum(["asc", "desc"]).exactOptional(),
        perPage: z.number().int().positive().max(100).exactOptional(),
        account: z.string().exactOptional(),
      }),
      result: z.object({ issues: z.array(GitHubIssueSchema) }),
    },
    listLabels: {
      type: "query",
      input: RepositoryInputSchema,
      result: z.object({ labels: z.array(GitHubLabelSchema) }),
    },
    createIssue: {
      type: "mutation",
      input: RepositoryInputSchema.extend({
        title: z.string().min(1),
        body: z.string().exactOptional(),
        labels: z.array(z.string()).exactOptional(),
        assignees: z.array(z.string()).exactOptional(),
        milestone: z.number().int().positive().exactOptional(),
      }),
      result: z.object({ issue: GitHubIssueSchema }),
    },
    updateIssue: {
      type: "mutation",
      input: IssueInputSchema.extend({
        title: z.string().min(1).exactOptional(),
        body: z.string().exactOptional(),
        state: z.enum(["open", "closed"]).exactOptional(),
        stateReason: z.enum(["completed", "not_planned", "reopened"]).exactOptional(),
        labels: z.array(z.string()).exactOptional(),
        assignees: z.array(z.string()).exactOptional(),
        milestone: z.number().int().positive().nullable().exactOptional(),
      }),
      result: z.object({ issue: GitHubIssueSchema }),
    },
    addIssueComment: {
      type: "mutation",
      input: IssueInputSchema.extend({ body: z.string().min(1) }),
      result: z.object({ comment: GitHubIssueCommentSchema }),
    },
    addLabels: {
      type: "mutation",
      input: IssueInputSchema.extend({ labels: z.array(z.string().min(1)).min(1) }),
      result: z.object({ labels: z.array(GitHubLabelSchema) }),
    },
    removeLabel: {
      type: "mutation",
      input: IssueInputSchema.extend({ label: z.string().min(1) }),
      result: z.object({ labels: z.array(GitHubLabelSchema) }),
    },
    listPullRequests: {
      type: "query",
      input: RepositoryInputSchema.extend({
        state: z.enum(["open", "closed", "all"]).exactOptional(),
        head: z.string().exactOptional(),
        base: z.string().exactOptional(),
        labels: z.array(z.string()).exactOptional(),
        sort: z.enum(["created", "updated", "popularity", "long-running"]).exactOptional(),
        direction: z.enum(["asc", "desc"]).exactOptional(),
        page: z.number().int().positive().exactOptional(),
        perPage: z.number().int().positive().max(100).exactOptional(),
      }),
      result: z.object({ pullRequests: z.array(GitHubPullRequestSchema) }),
    },
    getPullRequest: {
      type: "query",
      input: PullRequestInputSchema,
      result: z.object({
        pullRequest: GitHubPullRequestSchema,
        reviews: z.array(GitHubPRReviewSchema),
        comments: z.array(GitHubPRCommentSchema),
      }),
    },
    searchPullRequests: {
      type: "query",
      input: z.object({
        query: z.string().min(1),
        sort: z.enum(["comments", "reactions", "created", "updated"]).exactOptional(),
        order: z.enum(["asc", "desc"]).exactOptional(),
        perPage: z.number().int().positive().max(100).exactOptional(),
        account: z.string().exactOptional(),
      }),
      result: z.object({ pullRequests: z.array(GitHubPullRequestSchema) }),
    },
    getPRFiles: {
      type: "query",
      input: PullRequestInputSchema.extend({
        page: z.number().int().positive().exactOptional(),
        perPage: z.number().int().positive().max(100).exactOptional(),
      }),
      result: z.object({ files: z.array(GitHubPRFileChangeSchema) }),
    },
    getPRStatus: {
      type: "query",
      input: PullRequestInputSchema,
      result: z.object({ status: GitHubPRStatusSchema }),
    },
    createPullRequest: {
      type: "mutation",
      input: RepositoryInputSchema.extend({
        title: z.string().min(1),
        body: z.string().exactOptional(),
        head: z.string().min(1),
        base: z.string().min(1),
        draft: z.boolean().exactOptional(),
        maintainerCanModify: z.boolean().exactOptional(),
      }),
      result: z.object({ pullRequest: GitHubPullRequestSchema }),
    },
    mergePullRequest: {
      type: "mutation",
      input: PullRequestInputSchema.extend({
        method: GitHubMergeMethodSchema.exactOptional(),
        commitTitle: z.string().exactOptional(),
        commitMessage: z.string().exactOptional(),
        /** Head SHA the user reviewed; GitHub refuses the merge if the branch moved since. */
        sha: z.string().exactOptional(),
      }),
      result: z.object({ result: GitHubPRMergeResultSchema }),
    },
    setAutoMerge: {
      type: "mutation",
      input: PullRequestInputSchema.extend({
        enabled: z.boolean(),
        method: GitHubMergeMethodSchema.exactOptional(),
      }),
      result: z.object({ pullRequest: GitHubPullRequestSchema }),
    },
    updatePullRequest: {
      type: "mutation",
      input: PullRequestInputSchema.extend({
        title: z.string().min(1).exactOptional(),
        body: z.string().exactOptional(),
        state: z.enum(["open", "closed"]).exactOptional(),
        base: z.string().exactOptional(),
        labels: z.array(z.string()).exactOptional(),
        assignees: z.array(z.string()).exactOptional(),
        milestone: z.number().int().positive().nullable().exactOptional(),
        reviewers: z.array(z.string()).exactOptional(),
        teamReviewers: z.array(z.string()).exactOptional(),
      }),
      result: z.object({ pullRequest: GitHubPullRequestSchema }),
    },
    closePullRequest: {
      type: "mutation",
      input: PullRequestInputSchema,
      result: z.object({ pullRequest: GitHubPullRequestSchema }),
    },
    reviewPullRequest: {
      type: "mutation",
      input: PullRequestInputSchema.extend({
        event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
        body: z.string().exactOptional(),
        commitId: z.string().exactOptional(),
      }),
      result: z.object({ review: GitHubPRReviewSchema }),
    },
    commentPullRequest: {
      type: "mutation",
      input: PullRequestInputSchema.extend({
        body: z.string().min(1),
        path: z.string().exactOptional(),
        line: z.number().int().positive().exactOptional(),
        startLine: z.number().int().positive().exactOptional(),
        side: z.enum(["LEFT", "RIGHT"]).exactOptional(),
        subjectType: z.enum(["line", "file"]).exactOptional(),
        commitId: z.string().exactOptional(),
        inReplyTo: z.number().int().positive().exactOptional(),
      }),
      result: z.object({ comment: GitHubPRCommentSchema }),
    },
    addPRReviewers: {
      type: "mutation",
      input: PullRequestInputSchema.extend({
        reviewers: z.array(z.string().min(1)).exactOptional(),
        teamReviewers: z.array(z.string().min(1)).exactOptional(),
      }),
      result: z.object({ pullRequest: GitHubPullRequestSchema }),
    },
  },
} satisfies RPCSchema;
