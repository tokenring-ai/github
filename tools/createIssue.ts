import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_createIssue";
const displayName = "GitHub/createIssue";
const description = "Create a new issue in a GitHub repository";

/** Opening an issue is publicly visible and notifies watchers. */
const SAFETY_LEVEL = 5;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  title: z.string().min(1).describe("Issue title"),
  body: z.string().exactOptional().describe("Issue body, in Markdown"),
  labels: z.array(z.string()).exactOptional(),
  assignees: z.array(z.string()).exactOptional().describe("Usernames to assign"),
  milestone: z.number().int().positive().exactOptional().describe("Milestone number"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, ...options }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Create issue "${options.title}" in ${owner}/${repo}?`,
      detailedDescription: [
        `Open a new issue in ${owner}/${repo}. This is publicly visible and notifies repository watchers.`,
        "",
        `Title: ${options.title}`,
        `Labels: ${options.labels?.join(", ") || "(none)"}`,
        `Assignees: ${options.assignees?.join(", ") || "(none)"}`,
        "",
        "Body:",
        options.body ? intelligentTruncate(options.body, { maxLength: 2_000 }) : "(empty)",
      ].join("\n"),
      safetyLevel: SAFETY_LEVEL,
      default: false,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve creating the issue");

  const issue = await github.createIssue(owner, repo, stripUndefinedKeys(options));

  return {
    message: `**GitHub** Created ${owner}/${repo}#${issue.number}`,
    result: `Created issue ${owner}/${repo}#${issue.number}: ${issue.title}\n${issue.html_url}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
