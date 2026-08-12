import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatPRTable } from "../../../formatPullRequest.ts";
import GitHubService from "../../../GitHubService.ts";

const inputSchema = {
  args: {
    sort: {
      description: "Sort field",
      type: "enum",
      values: ["comments", "reactions", "created", "updated"],
      required: false,
    },
    order: {
      description: "Sort order",
      type: "enum",
      values: ["asc", "desc"],
      defaultValue: "desc",
    },
    limit: {
      description: "Maximum number of results",
      type: "number",
      defaultValue: 30,
    },
    account: {
      description: "Configured GitHub account to search as",
      type: "string",
      required: false,
    },
  },
  remainder: { name: "query", description: "Search query, including any GitHub search qualifiers", required: true },
} as const satisfies AgentCommandInputSchema;

async function execute({ remainder, args: { sort, order, limit, account }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const query = remainder.trim();
  if (!query) throw new CommandFailedError('A search query is required. Usage: /github prs search "<query>"');

  const pulls = await agent.requireService(GitHubService).searchPullRequests(query, stripUndefinedKeys({ sort, order, perPage: limit, account }));

  return `Pull request search results for "${query}":\n\n${formatPRTable(pulls)}`;
}

const help = `Search pull requests across GitHub.

This uses GitHub's search API, which has its own rate limit and accepts qualifiers in
the query. "is:pr" is added automatically unless the query already says what it wants.

Search results are summaries: diff stats, mergeability, and commit counts come only
from /github pr <owner>/<repo> <number>.

## Examples

/github prs search repo:vercel/ai is:open review-requested:@me
/github prs search author:octocat is:merged streaming
/github prs search org:tokenring-ai is:open draft:false --sort=updated`;

export default {
  name: "github prs search",
  description: "Search pull requests across repositories",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
