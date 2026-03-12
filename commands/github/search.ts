import Agent from "@tokenring-ai/agent/Agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import markdownTable from "@tokenring-ai/utility/string/markdownTable";
import GitHubService from "../../GitHubService.ts";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const query = remainder.trim();
  if (!query) throw new CommandFailedError("Usage: /github search <query>");

  const results = await agent.requireServiceByType(GitHubService).searchRepositories(query, {limit: 10});
  return `
GitHub repositories for "${query}":

${markdownTable(
  ["Repository", "Stars", "Language", "Description"],
  results.map(repo => [repo.full_name, String(repo.stargazers_count), repo.language ?? "", repo.description ?? ""]),
)}
  `.trim();
}

const help = `# /github search <query>

Search GitHub repositories by keyword.

## Example

/github search token ring`;

export default {name: "github search", description: "/github search - Search repositories", help, execute} satisfies TokenRingAgentCommand;
