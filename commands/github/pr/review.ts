import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import GitHubService from "../../../GitHubService.ts";
import parseRepoSlug from "../../../parseRepoSlug.ts";
import { parseIssueNumber } from "../issue.ts";

/** Accepts the verdicts a person would type, not GitHub's shouted enum. */
const VERDICTS = {
  approve: "APPROVE",
  "request-changes": "REQUEST_CHANGES",
  comment: "COMMENT",
} as const;

const inputSchema = {
  args: {
    commitId: {
      description: "SHA the review applies to; defaults to the current head",
      type: "string",
      required: false,
    },
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
      name: "prNumber",
      description: "The pull request number",
      required: true,
    },
    {
      name: "verdict",
      description: "approve, request-changes, or comment",
      required: true,
    },
  ],
  remainder: { name: "body", description: "The review body; required for request-changes and comment", required: false },
} as const satisfies AgentCommandInputSchema;

async function execute({
  args: { repositorySlug, prNumber, verdict, commitId, account },
  remainder,
  agent,
}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const key = verdict.toLowerCase();
  if (!(key in VERDICTS)) {
    throw new CommandFailedError(`"${verdict}" is not a review verdict. Use approve, request-changes, or comment.`);
  }
  const event = VERDICTS[key as keyof typeof VERDICTS];

  const { owner, repo } = parseRepoSlug(repositorySlug);
  const number = parseIssueNumber(prNumber);
  const body = remainder?.trim() ?? "";

  const review = await agent
    .requireService(GitHubService)
    .reviewPullRequest(owner, repo, number, stripUndefinedKeys({ event, body: body || undefined, commitId, account }));

  return `Submitted a **${review.state}** review on **${owner}/${repo}#${number}**\n${review.html_url}`;
}

const help = `Review a pull request.

The review body is everything after the verdict. GitHub requires one for
request-changes and comment; it is optional for approve.

GitHub does not let you review your own pull request.

## Examples

/github pr review vercel/ai 123 approve
/github pr review vercel/ai 123 approve Ship it, nice cleanup.
/github pr review vercel/ai 123 request-changes The retry loop needs a backoff.`;

export default {
  name: "github pr review",
  description: "Review a pull request",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
