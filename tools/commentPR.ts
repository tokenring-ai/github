import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_commentPR";
const displayName = "GitHub/commentPR";
const description = "Comment on a pull request, either on the conversation thread or inline on a specific file and line";

const SAFETY_LEVEL = 5;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  body: z.string().min(1).describe("Comment body, in Markdown"),
  path: z.string().exactOptional().describe("File path to comment on inline; omit to post on the conversation thread"),
  line: z.number().int().positive().exactOptional().describe("Line in the file's diff to anchor the comment to"),
  startLine: z.number().int().positive().exactOptional().describe("First line of a multi-line comment range"),
  side: z.enum(["LEFT", "RIGHT"]).exactOptional().describe("LEFT for the old version, RIGHT for the new one"),
  subjectType: z.enum(["line", "file"]).exactOptional().describe("'file' comments on the whole file and needs no line"),
  commitId: z.string().exactOptional().describe("SHA to anchor an inline comment to; defaults to the current head"),
  inReplyTo: z.number().int().positive().exactOptional().describe("ID of a review comment to reply to"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, prNumber, body, ...options }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const location = options.path ? `${options.path}${options.line ? `:${options.line}` : ""}` : "the conversation thread";

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Comment on ${owner}/${repo}#${prNumber}?`,
      detailedDescription: [
        `Post a comment on ${owner}/${repo}#${prNumber}, on ${location}. This is publicly visible and notifies the participants.`,
        "",
        "Comment:",
        intelligentTruncate(body, { maxLength: 2_000 }),
      ].join("\n"),
      safetyLevel: SAFETY_LEVEL,
      default: false,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve commenting on the pull request");

  const comment = await github.commentPullRequest(owner, repo, prNumber, body, stripUndefinedKeys(options));

  return {
    message: `**GitHub** Commented on ${owner}/${repo}#${prNumber}`,
    result: `Added a ${comment.kind} comment on ${owner}/${repo}#${prNumber}\n${comment.html_url}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
