import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import { formatPRTable } from "../formatPullRequest.ts";
import GitHubService from "../GitHubService.ts";

const name = "github_searchPRs";
const displayName = "GitHub/searchPRs";
const description = "Search pull requests across GitHub using the search API's query syntax";

const inputSchema = z.object({
  query: z.string().min(1).describe("GitHub search query, e.g. 'repo:owner/name is:open review-requested:@me'. 'is:pr' is added automatically"),
  sort: z.enum(["comments", "reactions", "created", "updated"]).exactOptional(),
  order: z.enum(["asc", "desc"]).exactOptional(),
  limit: z.number().int().positive().max(100).default(30),
  account: z.string().exactOptional().describe("Configured GitHub account to search as"),
});

async function execute({ query, limit, ...rest }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const pulls = await github.searchPullRequests(query, stripUndefinedKeys({ ...rest, perPage: limit }));

  return {
    message: `**GitHub** Found ${pulls.length} pull request(s) for "${query}"`,
    result: `Pull request search results for "${query}":\n\n${formatPRTable(pulls)}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
