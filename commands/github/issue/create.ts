import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import GitHubService from "../../../GitHubService.ts";
import parseRepoSlug from "../../../parseRepoSlug.ts";

const inputSchema = {
  args: {
    body: {
      description: "Issue body, in Markdown",
      type: "string",
      required: false,
    },
    labels: {
      description: "Comma-separated labels to apply",
      type: "string",
      required: false,
    },
    assignees: {
      description: "Comma-separated usernames to assign",
      type: "string",
      required: false,
    },
    milestone: {
      description: "Milestone number to attach the issue to",
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
  ],
  remainder: { name: "title", description: "Issue title", required: true },
} as const satisfies AgentCommandInputSchema;

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

async function execute({
  args: { repositorySlug, body, labels, assignees, milestone, account },
  remainder,
  agent,
}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const title = remainder.trim();
  if (!title) throw new CommandFailedError("An issue title is required. Usage: /github issue create <owner>/<repo> <title>");

  const { owner, repo } = parseRepoSlug(repositorySlug);

  const issue = await agent.requireService(GitHubService).createIssue(
    owner,
    repo,
    stripUndefinedKeys({
      title,
      body,
      labels: splitList(labels),
      assignees: splitList(assignees),
      milestone,
      account,
    }),
  );

  return `Created issue **${owner}/${repo}#${issue.number}**: ${issue.title}\n${issue.html_url}`;
}

const help = `Create a GitHub issue.

The title is everything after the repository slug.

## Examples

/github issue create vercel/ai Streaming breaks on Node 22
/github issue create vercel/ai --labels=bug,p1 --body="Steps to reproduce…" Crash on startup`;

export default {
  name: "github issue create",
  description: "Create an issue",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
