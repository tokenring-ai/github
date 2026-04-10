import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "@tokenring-ai/agent/types";
import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import GitHubService from "../../GitHubService.ts";

const inputSchema = {
  args: {},
  remainder: {name: "query", description: "Search query", required: true},
} as const satisfies AgentCommandInputSchema;

async function execute({
                         remainder,
                         agent,
                       }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const results = await agent
    .requireServiceByType(GitHubService)
    .searchRepositories(remainder, {limit: 10});
  return `
GitHub repositories for "${remainder}":

${markdownTable(
    ["Repository", "Stars", "Language", "Description"],
    results.map((repo) => [
      repo.full_name,
      String(repo.stargazers_count),
      repo.language ?? "",
      repo.description ?? "",
    ]),
)}
  `.trim();
}

const help = `Search GitHub repositories by keyword.

## Example

/github search token ring`;

export default {
  name: "github search",
  description: "Search repositories",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
