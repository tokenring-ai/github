import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import GitHubService from "../../../GitHubService.ts";
import parseRepoSlug from "../../../parseRepoSlug.ts";

const inputSchema = {
  args: {
    head: {
      description: "Source branch, as <branch> or <user>:<branch> for a fork",
      type: "string",
      required: true,
    },
    base: {
      description: "Target branch the changes merge into",
      type: "string",
      required: true,
    },
    body: {
      description: "Pull request description, in Markdown",
      type: "string",
      required: false,
    },
    draft: {
      description: "Open as a draft, which cannot be merged until marked ready",
      type: "flag",
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
  remainder: { name: "title", description: "Pull request title", required: true },
} as const satisfies AgentCommandInputSchema;

async function execute({
  args: { repositorySlug, head, base, body, draft, account },
  remainder,
  agent,
}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const title = remainder.trim();
  if (!title) throw new CommandFailedError("A pull request title is required. Usage: /github pr create <owner>/<repo> --head=<branch> --base=<branch> <title>");

  const { owner, repo } = parseRepoSlug(repositorySlug);

  const pull = await agent
    .requireService(GitHubService)
    .createPullRequest(owner, repo, stripUndefinedKeys({ title, head, base, body, draft: draft ?? false, account }));

  return `Opened pull request **${owner}/${repo}#${pull.number}**: ${pull.title}\n${pull.html_url}`;
}

const help = `Open a GitHub pull request.

The title is everything after the repository slug. Push the head branch before running
this — GitHub rejects a pull request whose head does not exist.

## Examples

/github pr create vercel/ai --head=fix-streaming --base=main Fix streaming on Node 22
/github pr create vercel/ai --head=octocat:wip --base=main --draft Work in progress`;

export default {
  name: "github pr create",
  description: "Open a pull request",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
