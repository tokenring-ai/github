import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatDiff } from "../../../formatPullRequest.ts";
import GitHubService from "../../../GitHubService.ts";
import parseRepoSlug from "../../../parseRepoSlug.ts";
import { parseIssueNumber } from "../issue.ts";

const inputSchema = {
  args: {
    paths: {
      description: "Comma-separated paths; only files whose path contains one of them are shown",
      type: "string",
      required: false,
    },
    maxLength: {
      description: "Character cap on the diff",
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

async function execute({ args: { repositorySlug, prNumber, paths, maxLength, account }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { owner, repo } = parseRepoSlug(repositorySlug);
  const number = parseIssueNumber(prNumber);
  const pathList = paths
    ? paths
        .split(",")
        .map(path => path.trim())
        .filter(Boolean)
    : undefined;

  const diff = await agent.requireService(GitHubService).getPRDiff(owner, repo, number, stripUndefinedKeys({ paths: pathList, maxLength, account }));

  return `Diff for **${owner}/${repo}#${number}**:\n\n${formatDiff(diff, stripUndefinedKeys({ paths: pathList }))}`;
}

const help = `Show a pull request's unified diff.

Diffs are capped so a large pull request doesn't flood the conversation. Use --paths to
narrow it before the cap applies, or /github pr files for an overview without hunks.

## Examples

/github pr diff vercel/ai 123
/github pr diff vercel/ai 123 --paths=packages/core,README.md
/github pr diff vercel/ai 123 --maxLength=20000`;

export default {
  name: "github pr diff",
  description: "Show a pull request's diff",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
