import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import GitHubService from "../../GitHubService.ts";

const inputSchema = {
  args: {
    account: {
      description: "Configured GitHub account to search as",
      type: "string",
      required: false,
    },
  },
  remainder: { name: "query", description: "Search query", required: true },
} as const satisfies AgentCommandInputSchema;

async function execute({ remainder, args: { account }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  if (!remainder.trim()) {
    throw new CommandFailedError("Search query is required. Usage: /github search <query>");
  }

  const results = await agent.requireService(GitHubService).searchRepositories(remainder, stripUndefinedKeys({ limit: 10, account }));

  return `
GitHub repositories for "${remainder}":

${markdownTable(
  ["Repository", "Stars", "Language", "Description"],
  results.map(repo => [repo.full_name, String(repo.stargazers_count), repo.language ?? "", repo.description ?? ""]),
)}
  `.trim();
}

const help = `Search GitHub repositories by keyword.

## Example

/github search token ring
/github search --account=work internal tooling`;

export default {
  name: "github search",
  description: "Search repositories",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
