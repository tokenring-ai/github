import { prefillChatInput } from "@tokenring-ai/one-frontend/components/ChatInputContext.tsx";
import type { GitHubItemKind } from "./paths.ts";

/**
 * The message an agent starts from when the user hands it an issue or pull
 * request. The agent has the github tools, so it fetches the details itself.
 */
export function agentPromptForItem(kind: GitHubItemKind, owner: string, repo: string, number: number, title: string): string {
  const noun = kind === "pull" ? "pull request" : "issue";
  const tool = kind === "pull" ? "github_getPR" : "github_getIssue";
  return [
    `Please look at GitHub ${noun} ${owner}/${repo}#${number}: "${title}".`,
    `Use ${tool} (with the comments) to read it, then summarize what it asks for and propose how to proceed.`,
  ].join("\n");
}

/** Puts the hand-off prompt into the agent's composer so the user can edit it before sending. */
export function handItemToAgent(agentId: string, kind: GitHubItemKind, owner: string, repo: string, number: number, title: string): void {
  prefillChatInput(agentId, agentPromptForItem(kind, owner, repo, number, title));
}
