import Agent from "@tokenring-ai/agent/Agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import GitHubService from "../../GitHubService.ts";

function parseRepoSlug(slug: string): {owner: string; repo: string} {
  const [owner, repo] = slug.split("/");
  if (!owner || !repo) throw new CommandFailedError("Repository must be in <owner>/<repo> format");
  return {owner, repo};
}

async function execute(remainder: string, agent: Agent): Promise<string> {
  const [slug, path, ref] = remainder.trim().split(/\s+/);
  if (!slug || !path) throw new CommandFailedError("Usage: /github file <owner>/<repo> <path> [ref]");

  const {owner, repo} = parseRepoSlug(slug);
  const file = await agent.requireServiceByType(GitHubService).getFile(owner, repo, path, ref);

  return `
Path: ${file.path}
SHA: ${file.sha}
Size: ${file.size}

${file.content}
  `.trim();
}

const help = `# /github file <owner>/<repo> <path> [ref]

Retrieve a file from a GitHub repository.

## Example

/github file vercel/ai README.md
/github file vercel/ai packages/core/package.json main`;

export default {name: "github file", description: "Get a repository file", help, execute} satisfies TokenRingAgentCommand;
