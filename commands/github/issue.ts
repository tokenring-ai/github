import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatComments, formatIssueDetail } from "../../formatIssue.ts";
import GitHubService from "../../GitHubService.ts";
import parseRepoSlug from "../../parseRepoSlug.ts";

const inputSchema = {
  args: {
    comments: {
      description: "Also show the issue's comment thread",
      type: "flag",
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
      name: "issueNumber",
      description: "The issue number",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

/** Accepts `123` or `#123`. */
export function parseIssueNumber(value: string): number {
  const parsed = Number(value.trim().replace(/^#/, ""));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CommandFailedError(`"${value}" is not a valid issue number`);
  }
  return parsed;
}

async function execute({ args: { repositorySlug, issueNumber, comments, account }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { owner, repo } = parseRepoSlug(repositorySlug);
  const number = parseIssueNumber(issueNumber);
  const github = agent.requireService(GitHubService);

  const issue = await github.getIssue(owner, repo, number, stripUndefinedKeys({ account }));
  let output = formatIssueDetail(issue, `${owner}/${repo}`);

  if (comments && issue.comments > 0) {
    const thread = await github.listIssueComments(owner, repo, number, stripUndefinedKeys({ account }));
    output += `\n\n## Comments (${thread.length} of ${issue.comments})\n\n${formatComments(thread)}`;
  }

  return output;
}

const help = `Show a GitHub issue's details.

## Examples

/github issue vercel/ai 123
/github issue vercel/ai 123 --comments`;

export default {
  name: "github issue",
  description: "Get issue details",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
