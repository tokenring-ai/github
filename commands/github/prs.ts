import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatPRTable } from "../../formatPullRequest.ts";
import GitHubService from "../../GitHubService.ts";
import parseRepoSlug from "../../parseRepoSlug.ts";

const inputSchema = {
  args: {
    state: {
      description: "Which pull requests to list",
      type: "enum",
      values: ["open", "closed", "all"],
      defaultValue: "open",
    },
    base: {
      description: "Target branch, e.g. main",
      type: "string",
      required: false,
    },
    head: {
      description: "Source branch, as <branch> or <user>:<branch> for a fork",
      type: "string",
      required: false,
    },
    labels: {
      description: "Comma-separated labels; only pull requests carrying one of them are listed",
      type: "string",
      required: false,
    },
    sort: {
      description: "Sort field",
      type: "enum",
      values: ["created", "updated", "popularity", "long-running"],
      defaultValue: "created",
    },
    limit: {
      description: "Maximum number of pull requests to list",
      type: "number",
      defaultValue: 30,
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
  const { repositorySlug, state, base, head, labels, sort, limit, account } = args;
  const { owner, repo } = parseRepoSlug(repositorySlug);

  const pulls = await agent.requireService(GitHubService).listPullRequests(
    owner,
    repo,
    stripUndefinedKeys({
      state,
      base,
      head,
      labels: labels
        ? labels
            .split(",")
            .map(label => label.trim())
            .filter(Boolean)
        : undefined,
      sort,
      perPage: limit,
      account,
    }),
  );

  return `Pull requests in **${owner}/${repo}** (state: ${state}):\n\n${formatPRTable(pulls)}`;
}

const help = `List pull requests in a GitHub repository.

GitHub's pulls endpoint has no label filter, so --labels narrows the page that came
back rather than the query itself. Raise --limit if a labelled pull request is missing.

## Examples

/github prs vercel/ai
/github prs vercel/ai --state=closed --base=main
/github prs vercel/ai --sort=updated --limit=50`;

export default {
  name: "github prs",
  description: "List repository pull requests",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
