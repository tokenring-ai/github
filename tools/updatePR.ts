import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_updatePR";
const displayName = "GitHub/updatePR";
const description = "Update a pull request's title, body, state, base branch, labels, assignees, or reviewers";

const SAFETY_LEVEL = 5;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  title: z.string().exactOptional(),
  body: z.string().exactOptional().describe("Replaces the existing description entirely"),
  state: z.enum(["open", "closed"]).exactOptional(),
  base: z.string().exactOptional().describe("Retarget the pull request at a different branch"),
  labels: z.array(z.string()).exactOptional().describe("Replaces the existing labels entirely"),
  assignees: z.array(z.string()).exactOptional().describe("Replaces the existing assignees entirely"),
  milestone: z.number().int().positive().nullable().exactOptional().describe("Milestone number, or null to clear it"),
  reviewers: z.array(z.string()).exactOptional().describe("Usernames to request a review from; adds to any existing requests"),
  teamReviewers: z.array(z.string()).exactOptional().describe("Team slugs to request a review from"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, prNumber, ...options }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const changes = Object.entries(options)
    .filter(([key]) => key !== "account")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") || "(cleared)" : String(value)}`);

  // Without this the user is asked to approve an empty change list, and the
  // update fans out to nothing but a re-read of the pull request.
  if (changes.length === 0) throw new ToolCallError(name, "No fields to update were provided");

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Update ${owner}/${repo}#${prNumber}?`,
      detailedDescription: [
        `Update pull request ${owner}/${repo}#${prNumber}. Body, labels, and assignees are replaced outright, not merged with what is already there.`,
        "",
        "Changes:",
        ...changes.map(change => `  ${change}`),
      ].join("\n"),
      safetyLevel: SAFETY_LEVEL,
      default: false,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve updating the pull request");

  const pull = await github.updatePullRequest(owner, repo, prNumber, stripUndefinedKeys(options));

  return {
    message: `**GitHub** Updated ${owner}/${repo}#${pull.number}`,
    result: `Updated pull request ${owner}/${repo}#${pull.number}: ${pull.title}\n${pull.html_url}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
