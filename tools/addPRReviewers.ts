import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_addPRReviewers";
const displayName = "GitHub/addPRReviewers";
const description = "Request a review on a pull request from users or teams";

/** This notifies real people and puts the pull request in their review queue. */
const SAFETY_LEVEL = 4;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  prNumber: z.number().int().positive().describe("Pull request number"),
  reviewers: z.array(z.string()).default([]).describe("Usernames to request a review from"),
  teamReviewers: z.array(z.string()).exactOptional().describe("Team slugs to request a review from"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, prNumber, reviewers, teamReviewers, account }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const everyone = [...reviewers, ...(teamReviewers ?? [])];
  // Checked before prompting, so an empty request doesn't ask the user to approve
  // notifying nobody and then fail against GitHub.
  if (everyone.length === 0) throw new ToolCallError(name, "At least one reviewer or team reviewer is required");

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Request a review on ${owner}/${repo}#${prNumber} from ${everyone.join(", ")}?`,
      detailedDescription: [
        `Request a review on ${owner}/${repo}#${prNumber}. This notifies each reviewer and adds the pull request to their review queue.`,
        "",
        `Users: ${reviewers.join(", ") || "(none)"}`,
        `Teams: ${teamReviewers?.join(", ") || "(none)"}`,
      ].join("\n"),
      safetyLevel: SAFETY_LEVEL,
      default: false,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve requesting a review");

  const pull = await github.addPRReviewers(owner, repo, prNumber, reviewers, teamReviewers, stripUndefinedKeys({ account }));
  const requested = [...pull.requested_reviewers.map(user => user.login), ...pull.requested_teams.map(team => team.slug)];

  return {
    message: `**GitHub** Requested a review on ${owner}/${repo}#${prNumber}`,
    result: `Requested a review on ${owner}/${repo}#${prNumber}.\nReviewers now pending: ${requested.join(", ") || "(none)"}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
