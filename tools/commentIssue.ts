import type Agent from "@tokenring-ai/agent/Agent";
import { permissionSlug } from "@tokenring-ai/chat";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_commentIssue";
const displayName = "GitHub/commentIssue";
const description = "Add a comment to a GitHub issue or pull request";

/** Public, and notifies the issue participants (approval standard: reaches people). */
const SAFETY_LEVEL = 8;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  issueNumber: z.number().int().positive().describe("The issue or pull request number"),
  body: z.string().min(1).describe("Comment body, in Markdown"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, issueNumber, body, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Comment on ${owner}/${repo}#${issueNumber}?`,
      detailedDescription: [
        `Post a comment on ${owner}/${repo}#${issueNumber}. This is publicly visible and notifies thread subscribers.`,
        "",
        "Comment:",
        intelligentTruncate(body, { maxLength: 2_000 }),
      ].join("\n"),
      safetyLevel: SAFETY_LEVEL,
      permission: { id: `github.${permissionSlug(owner)}.${permissionSlug(repo)}.issue.comment`, summary: `Comment on issues in ${owner}/${repo}` },
      default: false,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve posting the comment");

  const comment = await github.addIssueComment(owner, repo, issueNumber, body, stripUndefinedKeys({ account }));

  return {
    message: `**GitHub** Commented on ${owner}/${repo}#${issueNumber}`,
    result: `Posted comment on ${owner}/${repo}#${issueNumber}\n${comment.html_url}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
