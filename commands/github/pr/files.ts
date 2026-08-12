import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatPRFiles } from "../../../formatPullRequest.ts";
import GitHubService from "../../../GitHubService.ts";
import parseRepoSlug from "../../../parseRepoSlug.ts";
import { parseIssueNumber } from "../issue.ts";

const inputSchema = {
  args: {
    patch: {
      description: "Also show each file's diff hunks",
      type: "flag",
    },
    limit: {
      description: "Maximum number of files to list",
      type: "number",
      defaultValue: 100,
    },
    page: {
      description: "Page of files, for pull requests touching more than the limit",
      type: "number",
      required: false,
    },
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

async function execute({ args: { repositorySlug, prNumber, patch, limit, page, account }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { owner, repo } = parseRepoSlug(repositorySlug);
  const number = parseIssueNumber(prNumber);

  const files = await agent.requireService(GitHubService).getPRFiles(owner, repo, number, stripUndefinedKeys({ perPage: limit, page, account }));

  return `Files changed in **${owner}/${repo}#${number}**:\n\n${formatPRFiles(files, { includePatch: patch ?? false })}`;
}

const help = `List the files a pull request changes.

## Examples

/github pr files vercel/ai 123
/github pr files vercel/ai 123 --patch
/github pr files vercel/ai 123 --limit=100 --page=2`;

export default {
  name: "github pr files",
  description: "List a pull request's changed files",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
