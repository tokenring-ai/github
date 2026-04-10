import type Agent from "@tokenring-ai/agent/Agent";
import type {TokenRingToolDefinition} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_getRepoFile";
const displayName = "GitHub/getRepoFile";
const description = "Retrieve a file from a GitHub repository";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  path: z.string().min(1).describe("Path to the file inside the repository"),
  ref: z.string().optional().describe("Optional branch, tag, or commit"),
});

async function execute(
  {owner, repo, path, ref}: z.output<typeof inputSchema>,
  agent: Agent,
) {
  const github = agent.requireServiceByType(GitHubService);
  const file = await github.getFile(owner, repo, path, ref);

  return `
Path: ${file.path}
SHA: ${file.sha}
Size: ${file.size}

\`\`\`
${file.content}
\`\`\`
  `.trim();
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
