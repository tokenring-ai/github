import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_getRepoDocumentation";
const displayName = "GitHub/getRepoDocumentation";
const description = "Retrieve key documentation files for a GitHub repository";

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  ref: z.string().exactOptional().describe("Optional branch, tag, or commit"),
  maxFiles: z.number().int().positive().max(10).default(5),
  account: z.string().exactOptional().describe("Configured GitHub account to read as"),
});

async function execute({ owner, repo, ref, maxFiles, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const documentation = await github.getRepositoryDocumentation(
    owner,
    repo,
    stripUndefinedKeys({
      ref,
      maxFiles,
      account,
    }),
  );

  const files = documentation.files
    .map(file =>
      `
## ${file.path}

\`\`\`md
${file.content}
\`\`\`
  `.trim(),
    )
    .join("\n\n");

  return {
    message: `**GitHub** Retrieved documentation for ${owner}/${repo}`,
    // Naming the repository and branch keeps the content attributable, and says
    // which ref it came from when the caller didn't pick one.
    result: `Documentation for ${documentation.repository} (branch: ${documentation.branch}):\n\n${files}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
