import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_updateIssue";
const displayName = "GitHub/updateIssue";
const description = "Update a GitHub issue's title, body, state, labels, assignees, or milestone";

/** Editing or closing an issue overwrites content someone else may have authored. */
const SAFETY_LEVEL = 6;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  issueNumber: z.number().int().positive().describe("The issue number"),
  title: z.string().exactOptional(),
  body: z.string().exactOptional().describe("Replaces the existing body entirely"),
  state: z.enum(["open", "closed"]).exactOptional(),
  stateReason: z.enum(["completed", "not_planned", "reopened"]).exactOptional(),
  labels: z.array(z.string()).exactOptional().describe("Replaces the existing labels entirely"),
  assignees: z.array(z.string()).exactOptional().describe("Replaces the existing assignees entirely"),
  milestone: z.number().int().positive().nullable().exactOptional().describe("Milestone number, or null to clear it"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, issueNumber, ...options }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const changes = Object.entries(options)
    .filter(([key]) => key !== "account")
    .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`);

  if (changes.length === 0) throw new ToolCallError(name, "No fields to update were provided");

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Update issue ${owner}/${repo}#${issueNumber}?`,
      detailedDescription: [
        `Modify issue ${owner}/${repo}#${issueNumber}. Body, label, and assignee updates replace the existing values rather than merging with them.`,
        "",
        "Changes:",
        ...changes,
      ].join("\n"),
      safetyLevel: SAFETY_LEVEL,
      default: false,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve updating the issue");

  const issue = await github.updateIssue(owner, repo, issueNumber, stripUndefinedKeys(options));

  return {
    message: `**GitHub** Updated ${owner}/${repo}#${issue.number}`,
    result: `Updated issue ${owner}/${repo}#${issue.number}: ${issue.title} (state: ${issue.state})\n${issue.html_url}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
