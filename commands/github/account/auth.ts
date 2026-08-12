import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import authorizeAccount from "../../../authorizeAccount.ts";
import GitHubService from "../../../GitHubService.ts";

const inputSchema = {
  args: {},
  positionals: [
    {
      name: "name",
      description: "The GitHub account name to authenticate",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

export default {
  name: "github account auth",
  description: "Authenticate a GitHub account",
  inputSchema,
  execute: async ({ agent, args }: AgentCommandInputType<typeof inputSchema>): Promise<string> => {
    const accountName = args.name;
    if (!accountName) throw new CommandFailedError("Usage: /github account auth <accountName>");

    const gitHubService = agent.requireService(GitHubService);
    const account = gitHubService.requireAccount(accountName);

    if (account.token) {
      throw new CommandFailedError(
        `GitHub account "${accountName}" is configured with a personal access token, so it doesn't use the OAuth flow. Update its token with /connect github --name=${accountName} --token=<token>.`,
      );
    }

    return await authorizeAccount(agent, accountName);
  },
  help: `Re-run the GitHub OAuth flow for a configured account and store its token in the vault.

## Example

/github account auth github`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
