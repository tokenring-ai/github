import { z } from "zod";

export const GitHubConfigSchema = z.object({
  baseUrl: z.string().default("https://api.github.com").meta({ description: "GitHub API base URL (change for GitHub Enterprise)" }),
  token: z.string().exactOptional().meta({ sensitive: true, description: "GitHub personal access token" }),
  userAgent: z.string().default("TokenRing/0.2.0"),
});
