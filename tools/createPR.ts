import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { stripUndefinedKeys } from "@tokenring-ai/utility/object/stripObject";
import intelligentTruncate from "@tokenring-ai/utility/string/intelligentTruncate";
import { z } from "zod";
import GitHubService from "../GitHubService.ts";

const name = "github_createPR";
const displayName = "GitHub/createPR";
const description = "Open a new pull request in a GitHub repository";

/** Opening a pull request is publicly visible and notifies watchers and code owners. */
const SAFETY_LEVEL = 6;

const inputSchema = z.object({
  owner: z.string().min(1).describe("GitHub repository owner or org"),
  repo: z.string().min(1).describe("GitHub repository name"),
  title: z.string().min(1).describe("Pull request title"),
  head: z.string().min(1).describe("Source branch, as 'branch' or 'user:branch' for a fork"),
  base: z.string().min(1).describe("Target branch the changes merge into, e.g. 'main'"),
  body: z.string().exactOptional().describe("Pull request description, in Markdown"),
  draft: z.boolean().exactOptional().describe("Open as a draft, which cannot be merged until marked ready"),
  maintainerCanModify: z.boolean().exactOptional().describe("Let upstream maintainers push to the head branch"),
  account: z.string().exactOptional().describe("Configured GitHub account to act as"),
});

async function execute({ owner, repo, ...options }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const github = agent.requireService(GitHubService);
  const chatService = agent.requireService(ChatService);

  const approved = await chatService.checkToolApproval(
    {
      toolName: name,
      message: `Open pull request "${options.title}" in ${owner}/${repo}?`,
      detailedDescription: [
        `Open a ${options.draft ? "draft " : ""}pull request in ${owner}/${repo}. This is publicly visible and notifies watchers and code owners.`,
        "",
        `Title: ${options.title}`,
        `Merging: ${options.head} → ${options.base}`,
        "",
        "Body:",
        options.body ? intelligentTruncate(options.body, { maxLength: 2_000 }) : "(empty)",
      ].join("\n"),
      safetyLevel: SAFETY_LEVEL,
      default: false,
    },
    agent,
  );

  if (!approved) throw new ToolCallError(name, "User did not approve opening the pull request");

  const pull = await github.createPullRequest(owner, repo, stripUndefinedKeys(options));

  return {
    message: `**GitHub** Opened ${owner}/${repo}#${pull.number}`,
    result: `Opened pull request ${owner}/${repo}#${pull.number}: ${pull.title}\n${pull.html_url}`,
  };
}

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
