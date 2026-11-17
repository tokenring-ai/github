import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { type ConfigLayer, ConfigurationService } from "@tokenring-ai/app";
import SecretService from "@tokenring-ai/secrets/SecretService";
import { accountCredentialRef, saveToVaultThen, VAULT_LOCKED_MESSAGE } from "@tokenring-ai/secrets/vaultCredentials";
import authorizeAccount from "../../authorizeAccount.ts";
import GitHubService from "../../GitHubService.ts";

const inputSchema = {
  args: {
    name: {
      description: "The name to save the GitHub account under",
      type: "string",
      defaultValue: "github",
    },
    token: {
      description: "A personal access token to use instead of the OAuth sign-in flow. Typed inline it stays in the chat history",
      type: "string",
      required: false,
    },
    baseUrl: {
      description: "GitHub REST API base URL (change for GitHub Enterprise)",
      type: "string",
      required: false,
    },
    scopes: {
      description: "Comma-separated OAuth scopes to request",
      type: "string",
      required: false,
    },
    save: {
      description: "Where to save the GitHub account configuration - in the user configuration or in the project configuration",
      type: "enum",
      values: ["global", "workspace"],
      defaultValue: "workspace",
    },
  },
  positionals: [
    {
      name: "login",
      description: "The GitHub username to connect, used to pre-fill the sign-in page",
      required: false,
    },
  ],
} as const satisfies AgentCommandInputSchema;

export default {
  name: "connect github",
  alias: "github connect",
  description: "Connects a GitHub account",
  inputSchema,
  execute: async ({ agent, args: { login, name, token, baseUrl, scopes, save } }: AgentCommandInputType<typeof inputSchema>): Promise<string> => {
    const gitHubService = agent.requireService(GitHubService);
    const secrets = agent.requireService(SecretService);
    // A personal access token goes to the vault; refuse before asking for one if it can't be saved.
    if ((token || !gitHubService.hasOAuthClient()) && !secrets.canStore()) throw new CommandFailedError(VAULT_LOCKED_MESSAGE);

    // Without OAuth app credentials the sign-in flow can't run, so fall back to a personal access token.
    if (!token && !gitHubService.hasOAuthClient()) {
      token =
        (await agent.askForText({
          message: "GitHub OAuth is not configured. Enter a personal access token to connect with instead.",
          label: "Personal Access Token",
          masked: true,
        })) ?? undefined;

      if (!token) {
        throw new CommandFailedError("Usage: /connect github [login] --token=<personal access token>");
      }
    }

    const tokenRef = token ? accountCredentialRef("github", name, "token") : undefined;
    const configService = agent.requireService(ConfigurationService);
    const saveSettings = async () => {
      const overrides = configService.getOverrides(save);
      const github = (overrides.github ?? {}) as { accounts?: Record<string, unknown> };
      const accounts = github.accounts ?? {};
      const existingAccount = (accounts[name] ?? {}) as Record<string, unknown>;

      const next = {
        ...overrides,
        github: {
          ...github,
          accounts: {
            ...accounts,
            [name]: {
              ...existingAccount,
              ...(login && { login }),
              ...(baseUrl && { baseUrl }),
              ...(scopes && {
                scopes: scopes
                  .split(",")
                  .map(scope => scope.trim())
                  .filter(Boolean),
              }),
              ...(tokenRef && { token: tokenRef }),
            },
          },
        },
      } satisfies ConfigLayer;

      const result = await configService.apply(save, next);
      if (!result.ok) {
        throw new CommandFailedError(result.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n"));
      }
    };
    if (token && tokenRef) await saveToVaultThen(secrets, [[tokenRef, token]], saveSettings);
    else await saveSettings();

    if (token) {
      // The token is already usable, so confirm it works and report who it belongs to.
      const user = await gitHubService.getAuthenticatedUser(name);
      return `GitHub account "${name}" connected as ${user.login} using a personal access token.`;
    }

    return await authorizeAccount(agent, name);
  },
  help: `Connect a GitHub account and store its OAuth token in the vault.

By default this runs the GitHub OAuth web flow, which needs an OAuth app: set
github.clientId and github.clientSecret (or GITHUB_CLIENT_ID and
GITHUB_CLIENT_SECRET) and register http://127.0.0.1:<web host port>/oauth/github/callback
as the app's authorization callback URL.

Pass --token to connect with a personal access token instead, which needs no OAuth app.
The token is saved in the vault (category "github", key "<name>.token") and the
configuration only references it, so the vault must be unlocked. A token typed inline
stays in the chat history; without OAuth configured, omit --token to get a masked prompt.

## Examples

/connect github
/connect github octocat --name=work --scopes=repo,read:org
/connect github --token=ghp_xxx --name=ci
/connect github --baseUrl=https://github.example.com/api/v3 --name=enterprise`,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
