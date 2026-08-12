import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_reviewPR";
const displayName = "GitHub/reviewPR";
const description = "Submit a review on a pull request: approve, request changes, or comment";

/** An approval carries real weight — it can satisfy a branch protection rule and unblock a merge. */
const SAFETY_LEVEL = 6;

const EVENT_LABELS = {
  APPROVE: "Approve",
  REQUEST_CHANGES: "Request changes on",
  COMMENT: "Comment on",
} as const;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]).describe("The review verdict"),
  body: z.string().exactOptional().describe("Review comment; required for REQUEST_CHANGES and COMMENT"),
  commitId: z.string().exactOptional().describe("SHA the review applies to; defaults to the current head"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, prNumber, ...options }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `${EVENT_LABELS[options.event]} ${owner}/${repo}#${prNumber}?`,
      detailedDescription: [
        `Submit a ${options.event} review on ${owner}/${repo}#${prNumber}. Reviews are publicly visible, notify the author, and an approval can satisfy a branch protection rule.`,
        "",
        "Review body:",
        options.body ? intelligentTruncate(options.body, { maxLength: 2_000 }) : "(empty)",
      ].join("\n"),
      safetyLevel: SAFETY_LEVEL,
      default: false,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve submitting the review");

  const review = await github.reviewPullRequest(owner, repo, prNumber, stripUndefinedKeys(options));

  return {
    message: `**GitHub** Submitted a ${review.state} review on ${owner}/${repo}#${prNumber}`,
    result: `Submitted a ${review.state} review on ${owner}/${repo}#${prNumber}\n${review.html_url}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
