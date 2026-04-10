import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand,} from "@tokenring-ai/agent/types";
import GitHubService from "../../GitHubService.ts";

function parseRepoSlug(slug: string): { owner: string; repo: string } {
  const [owner, repo] = slug.split("/");
  if (!owner || !repo)
    throw new CommandFailedError("Repository must be in <owner>/<repo> format");
  return {owner, repo};
}

const inputSchema = {
  args: {},
  positionals: [
    {
      name: "repositorySlug",
      description: "Repository slug in <owner>/<repo> format",
      required: true,
    },
    {
      name: "path",
      description: "Path to the file inside the repository",
      required: true,
    },
    {
      name: "ref",
      description: "Git reference (branch, tag, commit) to use",
      required: false,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({
                         positionals,
                         agent,
                       }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const {repositorySlug, path, ref} = positionals;

  const {owner, repo} = parseRepoSlug(repositorySlug);
  const file = await agent
    .requireServiceByType(GitHubService)
    .getFile(owner, repo, path, ref);

  return `
Path: ${file.path}
SHA: ${file.sha}
Size: ${file.size}

${file.content}
  `.trim();
}

const help = `Retrieve a file from a GitHub repository.

## Example

/github file vercel/ai README.md
/github file vercel/ai packages/core/package.json main`;

export default {
  name: "github file",
  description: "Get a repository file",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
