import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatPRStatus } from "../formatPullRequest.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_getPRStatus";
const displayName = "GitHub/getPRStatus";
const description = "Get the CI status for a pull request's head commit, covering both commit statuses and Actions check runs";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute({ owner, repo, prNumber, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const status = await github.getPRStatus(owner, repo, prNumber, stripUndefinedKeys({ account }));

  return {
    message: `**GitHub** ${owner}/${repo}#${prNumber} checks: ${status.state}`,
    result: `Checks for ${owner}/${repo}#${prNumber}:\n\n${formatPRStatus(status)}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
