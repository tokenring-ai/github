import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import GitHubService from "../../GitHubService.ts";
import parseRepoSlug from "../../parseRepoSlug.ts";

const inputSchema = {
  args: {
    account: {
      description: "Configured GitHub account to read as",
      type: "string",
      required: false,
    },
  },
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

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { repositorySlug, path, ref, account } = args;

  const { owner, repo } = parseRepoSlug(repositorySlug);
  const file = await agent.requireService(GitHubService).getFile(owner, repo, path, ref, stripUndefinedKeys({ account }));

  return `
Repository: ${owner}/${repo}
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
