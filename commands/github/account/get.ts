import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import GitHubService from "../../../GitHubService.ts";

const inputSchema = {
  args: {},
  positionals: [
    {
      name: "name",
      description: "The account name to inspect",
      required: true,
    },
  ],
} as const satisfies AgentCommandInputSchema;

export default {
  name: "github account get",
  description: "Show a GitHub account",
  inputSchema,
  execute: ({ agent, args }: AgentCommandInputType<typeof inputSchema>) => {
    const gitHubService = agent.requireService(GitHubService);
    // `name` is a required positional; the framework merges it into args and validates presence.
    const accountName = args.name;

    const { isAuthenticated, usesPersonalAccessToken, grantedScopes, account, profile } = gitHubService.getAccountStatus(accountName);

    return [
      `Account: ${accountName}`,
      `Login: ${profile?.login ?? account.login ?? "(available after authentication)"}`,
      `Name: ${profile?.name ?? "(available after authentication)"}`,
      `API Base URL: ${account.baseUrl}`,
      `Credential: ${usesPersonalAccessToken ? "personal access token" : "oauth"}`,
      `Authenticated: ${isAuthenticated ? "yes" : "no"}`,
      `Granted Scopes: ${grantedScopes?.join(", ") || "(unknown)"}`,
    ].join("\n");
  },
  help: `Display a configured GitHub account.

## Example

/github account get github`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
