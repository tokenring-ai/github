import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import GitHubService from "../../GitHubService.ts";

const inputSchema = {
  args: {},
  positionals: [{
    name: "query",
    description: "Search query",
    required: true,
    greedy: true,
  }],
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({positionals: { query }, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const results = await agent.requireServiceByType(GitHubService).searchRepositories(query, {limit: 10});
  return `
GitHub repositories for "${query}":

${markdownTable(
  ["Repository", "Stars", "Language", "Description"],
  results.map(repo => [repo.full_name, String(repo.stargazers_count), repo.language ?? "", repo.description ?? ""]),
)}
  `.trim();
}

const help = `Search GitHub repositories by keyword.

## Example

/github search token ring`;

export default {name: "github search", description: "Search repositories", inputSchema, help, execute} satisfies TokenRingAgentCommand<typeof inputSchema>;
