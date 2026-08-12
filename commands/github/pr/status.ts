import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatPRStatus } from "../../../formatPullRequest.ts";
import GitHubService from "../../../GitHubService.ts";
import parseRepoSlug from "../../../parseRepoSlug.ts";
import { parseIssueNumber } from "../issue.ts";

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
      name: "prNumber",
      description: "The pull request number",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args: { repositorySlug, prNumber, account }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { owner, repo } = parseRepoSlug(repositorySlug);
  const number = parseIssueNumber(prNumber);

  const status = await agent.requireService(GitHubService).getPRStatus(owner, repo, number, stripUndefinedKeys({ account }));

  return `Checks for **${owner}/${repo}#${number}**:\n\n${formatPRStatus(status)}`;
}

const help = `Show the CI status for a pull request's head commit.

Both legacy commit statuses and Actions check runs are reported, since a repository may
use either. The rollup is as bad as its worst check.

## Examples

/github pr status vercel/ai 123`;

export default {
  name: "github pr status",
  description: "Show a pull request's CI status",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
