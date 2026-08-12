import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_addLabels";
const displayName = "GitHub/addLabels";
const description = "Add labels to a GitHub issue, keeping any labels already on it";

/** Additive and easily reversed, so less risky than editing content. */
const SAFETY_LEVEL = 4;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  issueNumber: z.number().int().positive().describe("The issue number"),
  labels: z.array(z.string().min(1)).min(1).describe("Label names to add"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, issueNumber, labels, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Add label(s) ${labels.join(", ")} to ${owner}/${repo}#${issueNumber}?`,
      detailedDescription: `Add the labels ${labels.join(", ")} to issue ${owner}/${repo}#${issueNumber}. Existing labels are kept. Labels that don't exist in the repository are created.`,
      safetyLevel: SAFETY_LEVEL,
      default: true,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve adding the labels");

  const updated = await github.addLabels(owner, repo, issueNumber, labels, stripUndefinedKeys({ account }));

  return {
    message: `**GitHub** Added label(s) to ${owner}/${repo}#${issueNumber}`,
    result: `Labels on ${owner}/${repo}#${issueNumber}: ${updated.map(label => label.name).join(", ") || "(none)"}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
