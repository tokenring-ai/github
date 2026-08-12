import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatPRTable } from "../formatPullRequest.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_listPRs";
const displayName = "GitHub/listPRs";
const description = "List pull requests in a GitHub repository, with optional state and branch filters";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  state: z.enum(["open", "closed", "all"]).default("open"),
  head: z.string().exactOptional().describe("Source branch, as 'branch' or 'user:branch' for a fork"),
  base: z.string().exactOptional().describe("Target branch, e.g. 'main'"),
  labels: z.array(z.string()).exactOptional().describe("Keep only pull requests carrying one of these labels"),
  sort: z.enum(["created", "updated", "popularity", "long-running"]).exactOptional(),
  direction: z.enum(["asc", "desc"]).exactOptional(),
  limit: z.number().int().positive().max(100).default(30),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute(input: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const { owner, repo, limit, ...rest } = input;
  const github = agent.requireService(GitHubService);
  const pulls = await github.listPullRequests(owner, repo, stripUndefinedKeys({ ...rest, perPage: limit }));

  return {
    message: `**GitHub** Listed ${pulls.length} ${input.state} pull request(s) in ${owner}/${repo}`,
    result: `Pull requests in ${owner}/${repo} (state: ${input.state}):\n\n${formatPRTable(pulls)}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
