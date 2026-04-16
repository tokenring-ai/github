import {AgentCommandService} from "@tokenring-ai/agent";
import type {TokenRingPlugin} from "@tokenring-ai/app";
import {ChatService} from "@tokenring-ai/chat";
import {z} from "zod";
import commands from "./commands.ts";
import GitHubService from "./GitHubService.ts";
import packageJSON from "./package.json" with {type: "json"};
import {GitHubConfigSchema} from "./schema.ts";
import tools from "./tools.ts";

const packageConfigSchema = z.object({
  github: GitHubConfigSchema.prefault({}),
});

export default {
  name: packageJSON.name,
  displayName: "GitHub Integration",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    app.addServices(new GitHubService(config.github));
    app.waitForService(ChatService, (chatService) =>
      chatService.addTools(...tools),
    );
    app.waitForService(AgentCommandService, (agentCommandService) =>
      agentCommandService.addAgentCommands(commands),
    );
  },
  config: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
