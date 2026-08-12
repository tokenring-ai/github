import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatPRComments } from "../formatPullRequest.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_listPRComments";
const displayName = "GitHub/listPRComments";
const description = "List a pull request's comments: the conversation thread, the inline review comments, or both";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  include: z.enum(["review", "conversation", "all"]).default("all").describe("'review' for inline code comments, 'conversation' for the thread"),
  limit: z.number().int().positive().max(100).default(30),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute({ owner, repo, prNumber, include, limit, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const comments = await github.listPRComments(owner, repo, prNumber, stripUndefinedKeys({ account, include, perPage: limit }));

  return {
    message: `**GitHub** Listed ${comments.length} comment(s) on ${owner}/${repo}#${prNumber}`,
    result: `Comments on ${owner}/${repo}#${prNumber}:\n\n${formatPRComments(comments)}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
