import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatIssueTable } from "../formatIssue.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_searchIssues";
const displayName = "GitHub/searchIssues";
const description =
  "Search issues and pull requests across GitHub using the search API. Supports qualifiers such as repo:owner/name, is:open, is:issue, label:bug, and author:username.";

const inputSchema = z.object({
  query: z.string().min(1).describe("Search query, including any GitHub search qualifiers"),
  sort: z.enum(["comments", "reactions", "created", "updated"]).exactOptional(),
  order: z.enum(["asc", "desc"]).exactOptional(),
  limit: z.number().int().positive().max(100).default(30),
  account: z.string().exactOptional().describe("Configured GitHub account to search as"),
});

async function execute({ query, sort, order, limit, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const issues = await github.searchIssues(query, stripUndefinedKeys({ sort, order, perPage: limit, account }));

  return {
    message: `**GitHub** Searched issues for "${query}"`,
    result: `Issue search results for "${query}":\n\n${formatIssueTable(issues)}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
