import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_removeLabel";
const displayName = "GitHub/removeLabel";
const description = "Remove a single label from a GitHub issue";

/** Reversible, but it discards triage state someone else may have set. */
const SAFETY_LEVEL = 4;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  issueNumber: z.number().int().positive().describe("The issue number"),
  label: z.string().min(1).describe("Name of the label to remove"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, issueNumber, label, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Remove label "${label}" from ${owner}/${repo}#${issueNumber}?`,
      detailedDescription: `Remove the label "${label}" from issue ${owner}/${repo}#${issueNumber}. The label itself stays defined in the repository.`,
      safetyLevel: SAFETY_LEVEL,
      default: true,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve removing the label");

  const remaining = await github.removeLabel(owner, repo, issueNumber, label, stripUndefinedKeys({ account }));

  return {
    message: `**GitHub** Removed label "${label}" from ${owner}/${repo}#${issueNumber}`,
    result: `Labels remaining on ${owner}/${repo}#${issueNumber}: ${remaining.map(entry => entry.name).join(", ") || "(none)"}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
