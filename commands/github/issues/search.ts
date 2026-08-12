import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatIssueTable } from "../../../formatIssue.ts";
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
  if (!query) throw new CommandFailedError('A search query is required. Usage: /github issues search "<query>"');

  const issues = await agent.requireService(GitHubService).searchIssues(query, stripUndefinedKeys({ sort, order, perPage: limit, account }));

  return `Issue search results for "${query}":\n\n${formatIssueTable(issues)}`;
}

const help = `Search issues and pull requests across GitHub.

This uses GitHub's search API, which has its own rate limit and accepts qualifiers in the query.
Results include pull requests unless the query narrows them out with is:issue.

## Examples

/github issues search repo:vercel/ai is:open label:bug
/github issues search is:issue author:octocat streaming
/github issues search org:tokenring-ai is:open --sort=updated`;

export default {
  name: "github issues search",
  description: "Search issues across repositories",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
