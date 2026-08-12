import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatIssueTable } from "../formatIssue.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_listIssues";
const displayName = "GitHub/listIssues";
const description = "List issues in a GitHub repository, with optional state, label, and assignee filters";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  state: z.enum(["open", "closed", "all"]).default("open"),
  labels: z.array(z.string()).exactOptional().describe("Only issues carrying all of these labels"),
  assignee: z.string().exactOptional().describe("Username, or '*' for any assignee, or 'none' for unassigned"),
  creator: z.string().exactOptional().describe("Username of the issue author"),
  mentioned: z.string().exactOptional().describe("Username mentioned in the issue"),
  milestone: z.string().exactOptional().describe("Milestone number, or '*' for any, or 'none' for no milestone"),
  since: z.string().exactOptional().describe("ISO timestamp; only issues updated at or after this time"),
  sort: z.enum(["created", "updated", "comments"]).exactOptional(),
  order: z.enum(["asc", "desc"]).exactOptional(),
  limit: z.number().int().positive().max(100).default(30),
  includePullRequests: z.boolean().default(false).describe("GitHub returns pull requests from the issues endpoint; off by default"),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute(input: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const { owner, repo, limit, ...rest } = input;
  const github = agent.requireService(GitHubService);
  const issues = await github.listIssues(owner, repo, stripUndefinedKeys({ ...rest, perPage: limit }));

  return {
    message: `**GitHub** Listed ${issues.length} ${input.state} issue(s) in ${owner}/${repo}`,
    result: `Issues in ${owner}/${repo} (state: ${input.state}):\n\n${formatIssueTable(issues)}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
