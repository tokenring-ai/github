import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { formatPRComments, formatPRDetail, formatPRReviews } from "../../formatPullRequest.ts";
import GitHubService from "../../GitHubService.ts";
import parseRepoSlug from "../../parseRepoSlug.ts";
import { parseIssueNumber } from "./issue.ts";

const inputSchema = {
  args: {
    comments: {
      description: "Also show the conversation thread and inline review comments",
      type: "flag",
    },
    reviews: {
      description: "Also show the submitted reviews",
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
      name: "prNumber",
      description: "The pull request number",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({ args: { repositorySlug, prNumber, comments, reviews, account }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const { owner, repo } = parseRepoSlug(repositorySlug);
  // Issues and pull requests share one number space, so the same parser applies.
  const number = parseIssueNumber(prNumber);
  const github = agent.requireService(GitHubService);
  const options = stripUndefinedKeys({ account });

  const pull = await github.getPullRequest(owner, repo, number, options);
  let output = formatPRDetail(pull, `${owner}/${repo}`);

  if (reviews) {
    const submitted = await github.listPRReviews(owner, repo, number, options);
    output += `\n\n## Reviews (${submitted.length})\n\n${formatPRReviews(submitted)}`;
  }

  if (comments) {
    const thread = await github.listPRComments(owner, repo, number, options);
    output += `\n\n## Comments (${thread.length})\n\n${formatPRComments(thread)}`;
  }

  return output;
}

const help = `Show a GitHub pull request's details.

## Examples

/github pr vercel/ai 123
/github pr vercel/ai 123 --reviews
/github pr vercel/ai #123 --comments --reviews`;

export default {
  name: "github pr",
  description: "Get pull request details",
  inputSchema,
  help,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
