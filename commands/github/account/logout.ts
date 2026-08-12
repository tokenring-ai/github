import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import GitHubService from "../../../GitHubService.ts";

const inputSchema = {
  args: {},
  positionals: [
    {
      name: "name",
      description: "The GitHub account name to sign out",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

export default {
  name: "github account logout",
  description: "Revoke a GitHub account's stored token",
  inputSchema,
  execute: async ({ agent, args }: AgentCommandInputType<typeof inputSchema>): Promise<string> => {
    const gitHubService = agent.requireService(GitHubService);
    const accountName = args.name;
    const account = gitHubService.requireAccount(accountName);

    if (account.token) {
      throw new CommandFailedError(
        `GitHub account "${accountName}" uses a personal access token from the configuration. Remove github.accounts.${accountName}.token to disconnect it.`,
      );
    }

    await gitHubService.revokeAuthorization(accountName);
    return `GitHub account "${accountName}" signed out. Re-authenticate with /github account auth ${accountName}.`;
  },
  help: `Revoke a GitHub account's OAuth token with GitHub and delete it from the vault.

The account stays configured, so it can be re-authenticated later.

## Example

/github account logout github`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
