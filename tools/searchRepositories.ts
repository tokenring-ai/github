import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_searchRepositories";
const displayName = "GitHub/searchRepositories";
const description = "Search GitHub repositories by keyword";

const inputSchema = z.object({
  query: z.string().min(1).describe("GitHub repository search query"),
  limit: z.number().int().positive().max(50).default(10).exactOptional(),
  sort: z.enum(["stars", "updated"]).exactOptional(),
  order: z.enum(["asc", "desc"]).exactOptional(),
});

async function execute({ query, limit, sort, order }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireServiceByType(GitHubService);
  const results = await github.searchRepositories(
    query,
    stripUndefinedKeys({
      limit,
      sort,
      order,
    }),
  );

  return `
Repository search results for "${query}":

${markdownTable(
  ["Repository", "Stars", "Language", "Description"],
  results.map(repo => [repo.full_name, String(repo.stargazers_count), repo.language ?? "", repo.description ?? ""]),
)}
  `.trim();
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
