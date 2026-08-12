import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_closePR";
const displayName = "GitHub/closePR";
const description = "Close a pull request without merging it";

const SAFETY_LEVEL = 5;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, prNumber, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const pull = await github.getPullRequest(owner, repo, prNumber, stripUndefinedKeys({ account }));

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Close ${owner}/${repo}#${prNumber} without merging?`,
      detailedDescription: [
        `Close pull request ${owner}/${repo}#${prNumber} without merging it. The branch is left alone and the pull request can be reopened.`,
        "",
        `Title: ${pull.title}`,
        `Author: ${pull.author?.login ?? "(unknown)"}`,
        `Merging: ${pull.head.ref} → ${pull.base.ref}`,
      ].join("\n"),
      safetyLevel: SAFETY_LEVEL,
      default: false,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve closing the pull request");

  const closed = await github.closePullRequest(owner, repo, prNumber, stripUndefinedKeys({ account }));

  return {
    message: `**GitHub** Closed ${owner}/${repo}#${closed.number}`,
    result: `Closed pull request ${owner}/${repo}#${closed.number}: ${closed.title}\n${closed.html_url}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
