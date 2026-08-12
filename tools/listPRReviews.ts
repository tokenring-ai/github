import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatPRReviews } from "../formatPullRequest.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_listPRReviews";
const displayName = "GitHub/listPRReviews";
const description = "List the reviews submitted on a pull request, with their approval state";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  limit: z.number().int().positive().max(100).default(30),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute({ owner, repo, prNumber, limit, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const reviews = await github.listPRReviews(owner, repo, prNumber, stripUndefinedKeys({ account, perPage: limit }));

  return {
    message: `**GitHub** Listed ${reviews.length} review(s) on ${owner}/${repo}#${prNumber}`,
    result: `Reviews on ${owner}/${repo}#${prNumber}:\n\n${formatPRReviews(reviews)}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
