import { z } from "zod";

export const GitHubConfigSchema = z.object({
  baseUrl: z.string().default("https://api.github.com"),
  token: z.string().exactOptional(),
  userAgent: z.string().default("TokenRing/0.2.0"),
});
