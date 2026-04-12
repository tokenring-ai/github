import type Agent from "@tokenring-ai/agent/Agent";
import type {TokenRingToolDefinition, TokenRingToolResult} from "@tokenring-ai/chat/schema";
import {z} from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_getRepoDocumentation";
const displayName = "GitHub/getRepoDocumentation";
const description = "Retrieve key documentation files for a GitHub repository";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  ref: z.string().optional().describe("Optional branch, tag, or commit"),
  maxFiles: z.number().int().positive().max(10).default(5).optional(),
});

async function execute(
  {owner, repo, ref, maxFiles}: z.output<typeof inputSchema>,
  agent: Agent,
): Promise<TokenRingToolResult> {
  const github = agent.requireServiceByType(GitHubService);
  const documentation = await github.getRepositoryDocumentation(owner, repo, {
    ref,
    maxFiles,
  });

  return documentation.files
    .map((file) =>
      `
## ${file.path}

\`\`\`md
${file.content}
\`\`\`
  `.trim(),
    )
    .join("\n\n");
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
