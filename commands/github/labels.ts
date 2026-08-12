import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatLabelTable } from "../../formatIssue.ts";
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
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args: { repositorySlug, account }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { owner, repo } = parseRepoSlug(repositorySlug);
  const labels = await agent.requireService(GitHubService).listLabels(owner, repo, stripUndefinedKeys({ account }));

  return `Labels in **${owner}/${repo}**:\n\n${formatLabelTable(labels)}`;
}

const help = `List the labels defined in a GitHub repository.

## Example

/github labels vercel/ai`;

export default {
  name: "github labels",
  description: "List repository labels",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
