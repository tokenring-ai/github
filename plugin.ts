import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { resolveSecret } from "@tokenring-ai/secrets/SecretService";
import WebHostService from "@tokenring-ai/web-host/WebHostService";
import commands from "./commands.ts";
import GitHubOAuthCallbackResource from "./GitHubOAuthCallbackResource.ts";
import GitHubService from "./GitHubService.ts";
import packageJSON from "./package.json" with { type: "json" };
import { GitHubPackageConfigSchema, type ResolvedGitHubAccount, type ResolvedGitHubConfig } from "./schema.ts";
import tools from "./tools.ts";

export default {
  name: packageJSON.name,
  displayName: "GitHub Integration",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    const gitHubService = app.addService(new GitHubService(app));

    app.waitForService(ChatService, chatService => chatService.addTools(tools));
    app.waitForService(AgentCommandService, agentCommandService => agentCommandService.addAgentCommands(commands));

    app.services.waitForItemByType(WebHostService, webHostService => {
      webHostService.registerResource("github-oauth-callback", new GitHubOAuthCallbackResource(gitHubService));
    });
  },
  reconfigure(app, config) {
    // Resolve up front so a misconfigured secret fails at configure, not on the first API call.
    const { clientId: clientIdRef, clientSecret: clientSecretRef, accounts, ...rest } = config.github;
    const clientId = resolveSecret(app, clientIdRef);
    const clientSecret = resolveSecret(app, clientSecretRef);

    const resolvedAccounts: Record<string, ResolvedGitHubAccount> = {};
    for (const [name, { token: tokenRef, ...account }] of Object.entries(accounts)) {
      const token = tokenRef === undefined ? undefined : resolveSecret(app, tokenRef);
      resolvedAccounts[name] = { ...account, ...(token !== undefined && { token }) };
    }

    const resolved: ResolvedGitHubConfig = {
      ...rest,
      accounts: resolvedAccounts,
      ...(clientId !== undefined && { clientId }),
      ...(clientSecret !== undefined && { clientSecret }),
    };

    app.requireService(GitHubService).reconfigure(resolved);
  },
  configSchema: GitHubPackageConfigSchema,
} satisfies TokenRingPlugin<typeof GitHubPackageConfigSchema>;
