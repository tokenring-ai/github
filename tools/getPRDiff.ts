import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatDiff } from "../formatPullRequest.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_getPRDiff";
const displayName = "GitHub/getPRDiff";
const description = "Get a pull request's unified diff, optionally narrowed to specific files";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  paths: z.array(z.string()).exactOptional().describe("Keep only files whose path contains one of these; use this on large pull requests"),
  maxLength: z.number().int().positive().exactOptional().describe("Character cap on the returned diff"),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute({ owner, repo, prNumber, ...options }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const diff = await github.getPRDiff(owner, repo, prNumber, stripUndefinedKeys(options));

  return {
    message: `**GitHub** Retrieved the diff for ${owner}/${repo}#${prNumber}`,
    result: `Diff for ${owner}/${repo}#${prNumber}:\n\n${formatDiff(diff, stripUndefinedKeys({ paths: options.paths }))}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
