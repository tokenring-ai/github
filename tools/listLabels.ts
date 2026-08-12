import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatLabelTable } from "../formatIssue.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_listLabels";
const displayName = "GitHub/listLabels";
const description = "List the labels defined in a GitHub repository";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  limit: z.number().int().positive().max(100).default(100),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute({ owner, repo, limit, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const labels = await github.listLabels(owner, repo, stripUndefinedKeys({ perPage: limit, account }));

  return {
    message: `**GitHub** Listed ${labels.length} label(s) in ${owner}/${repo}`,
    result: `Labels in ${owner}/${repo}:\n\n${formatLabelTable(labels)}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
