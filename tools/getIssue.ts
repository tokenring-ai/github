import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatComments, formatIssueDetail } from "../formatIssue.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_getIssue";
const displayName = "GitHub/getIssue";
const description = "Get a GitHub issue's details, optionally with its comment thread";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  issueNumber: z.number().int().positive().describe("The issue number"),
  includeComments: z.boolean().default(false).describe("Also fetch the issue's comments"),
  commentLimit: z.number().int().positive().max(100).default(30),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute(
  { owner, repo, issueNumber, includeComments, commentLimit, account }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const issue = await github.getIssue(owner, repo, issueNumber, stripUndefinedKeys({ account }));

  let result = formatIssueDetail(issue, `${owner}/${repo}`);

  if (includeComments && issue.comments > 0) {
    const comments = await github.listIssueComments(owner, repo, issueNumber, stripUndefinedKeys({ account, perPage: commentLimit }));
    result += `\n\n## Comments (${comments.length} of ${issue.comments})\n\n${formatComments(comments)}`;
  }

  return {
    message: `**GitHub** Retrieved ${owner}/${repo}#${issueNumber}`,
    result,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
