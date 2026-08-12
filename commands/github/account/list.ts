import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import GitHubService from "../../../GitHubService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

export default {
  name: "github account list",
  description: "List available GitHub accounts",
  help: `List all configured GitHub accounts and whether each one is authenticated.

## Example

/github account list`,
  inputSchema,
  execute: ({ agent }: AgentCommandInputType<typeof inputSchema>) => {
    const gitHubService = agent.requireService(GitHubService);
    const accounts = gitHubService.getAvailableAccounts();
    if (accounts.length === 0) return "No GitHub accounts are configured. Connect one with /connect github.";

    const lines = accounts.map(name => {
      const { isAuthenticated, usesPersonalAccessToken, account, profile } = gitHubService.getAccountStatus(name);
      const details = [
        isAuthenticated ? "authenticated" : "not authenticated",
        usesPersonalAccessToken ? "personal access token" : "oauth",
        profile ? `profile (${profile.login})` : "no profile",
        account.baseUrl === "https://api.github.com" ? null : account.baseUrl,
      ]
        .filter(Boolean)
        .join(", ");
      return `- ${name}: ${account.login ?? profile?.login ?? "(unknown login)"} [${details}]`;
    });

    return `Available GitHub accounts:\n${lines.join("\n")}`;
  },
} satisfies TokenRingAgentCommand<typeof inputSchema>;
