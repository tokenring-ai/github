import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatPRComments, formatPRDetail, formatPRReviews } from "../formatPullRequest.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_getPR";
const displayName = "GitHub/getPR";
const description = "Get a pull request's details, optionally with its reviews and comments";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  includeReviews: z.boolean().default(false).describe("Also fetch submitted reviews"),
  includeComments: z.boolean().default(false).describe("Also fetch the conversation thread and inline review comments"),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute(
  { owner, repo, prNumber, includeReviews, includeComments, account }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const options = stripUndefinedKeys({ account });

  const pull = await github.getPullRequest(owner, repo, prNumber, options);
  let result = formatPRDetail(pull, `${owner}/${repo}`);

  if (includeReviews) {
    const reviews = await github.listPRReviews(owner, repo, prNumber, options);
    result += `\n\n## Reviews (${reviews.length})\n\n${formatPRReviews(reviews)}`;
  }

  if (includeComments) {
    const comments = await github.listPRComments(owner, repo, prNumber, options);
    result += `\n\n## Comments (${comments.length})\n\n${formatPRComments(comments)}`;
  }

  return {
    message: `**GitHub** Retrieved ${owner}/${repo}#${prNumber}`,
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
