import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import GitHubService from "../../GitHubService.ts";

function parseRepoSlug(slug: string): {owner: string; repo: string} {
  const [owner, repo] = slug.split("/");
  if (!owner || !repo) throw new CommandFailedError("Repository must be in <owner>/<repo> format");
  return {owner, repo};
}

const inputSchema = {
  args: {},
  positionals: [{
    name: "repositorySlug",
    description: "Repository slug in <owner>/<repo> format",
    required: true,
  }]
} as const satisfies AgentCommandInputSchema;

async function execute({positionals: {repositorySlug}, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const {owner, repo} = parseRepoSlug(repositorySlug);
  const documentation = await agent.requireServiceByType(GitHubService).getRepositoryDocumentation(owner, repo, {maxFiles: 5});
  return documentation.files.map(file => `## ${file.path}\n\n${file.content}`).join("\n\n");
}

const help = `Retrieve the main documentation files for a GitHub repository.

## Example

/github docs vercel/ai`;

export default {name: "github docs", description: "Get repository documentation", inputSchema, help, execute} satisfies TokenRingAgentCommand<typeof inputSchema>;
