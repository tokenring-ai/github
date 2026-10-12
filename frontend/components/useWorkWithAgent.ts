import { useAppAgentSession } from "@tokenring-ai/one-frontend/hooks/useAppAgentSession.tsx";
import { useBusyAction } from "@tokenring-ai/one-frontend/hooks/useBusyAction.ts";
import { useCallback } from "react";
import { handItemToAgent, useGitHubNavigation } from "../lib/githubShared.tsx";
import type { GitHubItemKind } from "../lib/paths.ts";

/** Hands an item to the attached agent (creating one when none is attached) and opens its chat. */
export function useWorkWithAgent(agentTypes: readonly string[]) {
  const { openAgentChat } = useGitHubNavigation();
  const { agentId, createAgent } = useAppAgentSession({ appName: "GitHub dashboard", storageKey: "github", agentTypes });
  const { busy, execute } = useBusyAction();

  const workWithAgent = useCallback(
    async (kind: GitHubItemKind, owner: string, repo: string, number: number, title: string) => {
      await execute(async () => {
        const id = agentId ?? (await createAgent());
        if (!id) return;
        handItemToAgent(id, kind, owner, repo, number, title);
        openAgentChat(id);
      });
    },
    [agentId, createAgent, execute, openAgentChat],
  );

  return { busy, workWithAgent };
}
