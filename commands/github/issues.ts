import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatIssueTable } from "../../formatIssue.ts";
import GitHubService from "../../GitHubService.ts";
import parseRepoSlug from "../../parseRepoSlug.ts";

const inputSchema = {
  args: {
    state: {
      description: "Which issues to list",
      type: "enum",
      values: ["open", "closed", "all"],
      defaultValue: "open",
    },
    labels: {
      description: "Comma-separated labels; only issues carrying all of them are listed",
      type: "string",
      required: false,
    },
    assignee: {
      description: "Username, or '*' for any assignee, or 'none' for unassigned",
      type: "string",
      required: false,
    },
    creator: {
      description: "Username of the issue author",
      type: "string",
      required: false,
    },
    sort: {
      description: "Sort field",
      type: "enum",
      values: ["created", "updated", "comments"],
      defaultValue: "created",
    },
    limit: {
      description: "Maximum number of issues to list",
      type: "number",
      defaultValue: 30,
    },
    includePullRequests: {
      description: "Include pull requests, which GitHub returns from the issues endpoint",
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
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { repositorySlug, state, labels, assignee, creator, sort, limit, includePullRequests, account } = args;
  const { owner, repo } = parseRepoSlug(repositorySlug);

  const issues = await agent.requireService(GitHubService).listIssues(
    owner,
    repo,
    stripUndefinedKeys({
      state,
      labels: labels
        ? labels
            .split(",")
            .map(label => label.trim())
            .filter(Boolean)
        : undefined,
      assignee,
      creator,
      sort,
      perPage: limit,
      includePullRequests: includePullRequests ?? false,
      account,
    }),
  );

  return `Issues in **${owner}/${repo}** (state: ${state}):\n\n${formatIssueTable(issues)}`;
}

const help = `List issues in a GitHub repository.

Pull requests are excluded by default, even though GitHub's issues endpoint returns them.
Pass --includePullRequests to include them.

## Examples

/github issues vercel/ai
/github issues vercel/ai --state=closed --labels=bug,regression
/github issues vercel/ai --assignee=octocat --sort=updated --limit=50`;

export default {
  name: "github issues",
  description: "List repository issues",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
