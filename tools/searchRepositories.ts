import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import {z} from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_searchRepositories";
const displayName = "GitHub/searchRepositories";
const description = "Search GitHub repositories by keyword";

const inputSchema = z.object({
  query: z.string().min(1).describe("GitHub repository search query"),
  limit: z.number().int().positive().max(50).default(10).optional(),
  sort: z.enum(["stars", "updated"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

async function execute({query, limit, sort, order}: z.output<typeof inputSchema>, agent: Agent) {
  const github = agent.requireServiceByType(GitHubService);
  const results = await github.searchRepositories(query, {limit, sort, order});

  return `
Repository search results for "${query}":

${markdownTable(
  ["Repository", "Stars", "Language", "Description"],
  results.map(repo => [
    repo.full_name,
    String(repo.stargazers_count),
    repo.language ?? "",
    repo.description ?? "",
  ]),
)}
  `.trim();
}

export default {name, displayName, description, inputSchema, execute} satisfies TokenRingToolDefinition<typeof inputSchema>;
