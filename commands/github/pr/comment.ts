import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import GitHubService from "../../../GitHubService.ts";
import parseRepoSlug from "../../../parseRepoSlug.ts";
import { parseIssueNumber } from "../issue.ts";

const inputSchema = {
  args: {
    path: {
      description: "File path to comment on inline; omit to post on the conversation thread",
      type: "string",
      required: false,
    },
    line: {
      description: "Line in the file's diff to anchor the comment to",
      type: "number",
      required: false,
    },
    side: {
      description: "Which side of the diff the line is on",
      type: "enum",
      values: ["LEFT", "RIGHT"],
      required: false,
    },
    replyTo: {
      description: "ID of a review comment to reply to",
      type: "number",
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
  ],
  remainder: { name: "comment", description: "The comment body", required: true },
} as const satisfies AgentCommandInputSchema;

async function execute({
  args: { repositorySlug, prNumber, path, line, side, replyTo, account },
  remainder,
  agent,
}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const body = remainder.trim();
  if (!body) throw new CommandFailedError("A comment body is required. Usage: /github pr comment <owner>/<repo> <number> <comment>");

  const { owner, repo } = parseRepoSlug(repositorySlug);
  const number = parseIssueNumber(prNumber);

  const comment = await agent
    .requireService(GitHubService)
    .commentPullRequest(owner, repo, number, body, stripUndefinedKeys({ path, line, side, inReplyTo: replyTo, account }));

  return `Added a ${comment.kind} comment on **${owner}/${repo}#${number}**\n${comment.html_url}`;
}

const help = `Comment on a pull request.

Without --path this posts on the conversation thread. With --path it becomes an inline
review comment, which needs a --line unless it is commenting on the file as a whole.

## Examples

/github pr comment vercel/ai 123 Looks good, one nit below.
/github pr comment vercel/ai 123 --path=src/index.ts --line=42 This can be null here.
/github pr comment vercel/ai 123 --replyTo=987654 Good catch, fixed.`;

export default {
  name: "github pr comment",
  description: "Comment on a pull request",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
