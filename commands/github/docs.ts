import Agent from "@tokenring-ai/agent/Agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import GitHubService from "../../GitHubService.ts";

function parseRepoSlug(slug: string): {owner: string; repo: string} {
  const [owner, repo] = slug.split("/");
  if (!owner || !repo) throw new CommandFailedError("Repository must be in <owner>/<repo> format");
  return {owner, repo};
}

async function execute(remainder: string, agent: Agent): Promise<string> {
  const slug = remainder.trim();
  if (!slug) throw new CommandFailedError("Usage: /github docs <owner>/<repo>");

  const {owner, repo} = parseRepoSlug(slug);
  const documentation = await agent.requireServiceByType(GitHubService).getRepositoryDocumentation(owner, repo, {maxFiles: 5});
  return documentation.files.map(file => `## ${file.path}\n\n${file.content}`).join("\n\n");
}

const help = `# /github docs <owner>/<repo>

Retrieve the main documentation files for a GitHub repository.

## Example

/github docs vercel/ai`;

export default {name: "github docs", description: "Get repository documentation", help, execute} satisfies TokenRingAgentCommand;
