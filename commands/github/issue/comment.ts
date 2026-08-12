import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import GitHubService from "../../../GitHubService.ts";
import parseRepoSlug from "../../../parseRepoSlug.ts";
import { parseIssueNumber } from "../issue.ts";

const inputSchema = {
  args: {
    account: {
      description: "Configured GitHub account to act as",
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
      name: "issueNumber",
      description: "The issue number",
      required: true,
    },
  ],
  remainder: { name: "comment", description: "The comment body", required: true },
} as const satisfies AgentCommandInputSchema;

async function execute({ args: { repositorySlug, issueNumber, account }, remainder, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const body = remainder.trim();
  if (!body) throw new CommandFailedError("A comment body is required. Usage: /github issue comment <owner>/<repo> <number> <comment>");

  const { owner, repo } = parseRepoSlug(repositorySlug);
  const number = parseIssueNumber(issueNumber);

  const comment = await agent.requireService(GitHubService).addIssueComment(owner, repo, number, body, stripUndefinedKeys({ account }));

  return `Commented on **${owner}/${repo}#${number}**\n${comment.html_url}`;
}

const help = `Comment on a GitHub issue or pull request.

The comment body is everything after the issue number.

## Example

/github issue comment vercel/ai 123 Thanks, this is fixed in v4.2.0`;

export default {
  name: "github issue comment",
  description: "Comment on an issue",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
