import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatPRFiles } from "../formatPullRequest.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_getPRFiles";
const displayName = "GitHub/getPRFiles";
const description = "List the files a pull request changes, with per-file line counts and optional diff hunks";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  includePatch: z.boolean().default(false).describe("Include each file's diff hunks; each is truncated individually"),
  limit: z.number().int().positive().max(100).default(100),
  page: z.number().int().positive().exactOptional().describe("Page of files, for pull requests touching more than the limit"),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute(
  { owner, repo, prNumber, includePatch, limit, page, account }: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const files = await github.getPRFiles(owner, repo, prNumber, stripUndefinedKeys({ account, perPage: limit, page }));

  return {
    message: `**GitHub** Listed ${files.length} changed file(s) in ${owner}/${repo}#${prNumber}`,
    result: `Files changed in ${owner}/${repo}#${prNumber}:\n\n${formatPRFiles(files, { includePatch })}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
