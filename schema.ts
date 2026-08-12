import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import { fromEnv, secret, sourcedValue, type WithResolvedSecrets } from "@tokenring-ai/secrets/secret";
import { z } from "zod";

/** Scopes requested when an account doesn't ask for anything more specific. */
export const DEFAULT_GITHUB_SCOPES = ["repo", "read:org", "read:user"];

export const GitHubAccountSchema = z.object({
  login: z
    .string()
    .exactOptional()
    .meta({ description: "GitHub username, used to pre-fill the sign-in page" } satisfies ConfigFieldMeta),
  baseUrl: z
    .string()
    .default("https://api.github.com")
    .meta({ advanced: true, description: "GitHub REST API base URL (change for GitHub Enterprise)" } satisfies ConfigFieldMeta),
  scopes: z
    .array(z.string())
    .default(DEFAULT_GITHUB_SCOPES)
    .meta({ description: "OAuth scopes requested when authenticating this account" } satisfies ConfigFieldMeta),
  token: secret({ description: "Personal access token, used instead of the OAuth sign-in flow" } satisfies ConfigFieldMeta).exactOptional(),
});

/** The per-account payload stored in the vault. Never written to the config file. */
export const GitHubStoredTokenSchema = z.object({
  accessToken: z
    .string()
    .exactOptional()
    .meta({ sensitive: true, description: "OAuth access token (obtained via login)" } satisfies ConfigFieldMeta),
  refreshToken: z
    .string()
    .exactOptional()
    .meta({ sensitive: true, description: "OAuth refresh token (GitHub Apps only)" } satisfies ConfigFieldMeta),
  expiryDate: z.number().exactOptional(),
  refreshTokenExpiryDate: z.number().exactOptional(),
  grantedScopes: z.array(z.string()).exactOptional(),
  profile: z
    .object({
      login: z.string().nullable().exactOptional(),
      id: z.number().nullable().exactOptional(),
      name: z.string().nullable().exactOptional(),
      email: z.string().nullable().exactOptional(),
      company: z.string().nullable().exactOptional(),
      avatar_url: z.string().nullable().exactOptional(),
      html_url: z.string().nullable().exactOptional(),
    })
    .exactOptional(),
});

export const GitHubConfigSchema = z
  .object({
    clientId: sourcedValue({ description: "GitHub OAuth app client ID" } satisfies ConfigFieldMeta).default(fromEnv("GITHUB_CLIENT_ID")),
    clientSecret: secret({ description: "GitHub OAuth app client secret" } satisfies ConfigFieldMeta).default(fromEnv("GITHUB_CLIENT_SECRET")),
    clientType: z
      .enum(["oauth-app", "github-app"])
      .default("oauth-app")
      .meta({ advanced: true, description: "Whether the credentials belong to an OAuth App or a GitHub App" } satisfies ConfigFieldMeta),
    userAgent: z
      .string()
      .default("TokenRing")
      .meta({ advanced: true, description: "User-Agent sent with GitHub API requests" } satisfies ConfigFieldMeta),
    accounts: z
      .record(z.string(), GitHubAccountSchema)
      .default({})
      .meta({ label: "Accounts", description: "Connected GitHub accounts, keyed by name" } satisfies ConfigFieldMeta),
    defaultAccount: z
      .string()
      .exactOptional()
      .meta({ description: "Account used when a tool or command doesn't name one" } satisfies ConfigFieldMeta),
  })
  .meta({ label: "GitHub", description: "GitHub OAuth accounts, repository search, and content retrieval settings" } satisfies ConfigFieldMeta);

export type GitHubConfig = z.input<typeof GitHubConfigSchema>;
export type ParsedGitHubConfig = z.output<typeof GitHubConfigSchema>;
export type ParsedGitHubAccount = z.output<typeof GitHubAccountSchema>;

/** An account as handed to the service, with its personal access token already resolved. */
export type ResolvedGitHubAccount = Omit<ParsedGitHubAccount, "token"> & { token?: string | undefined };

/** Config as handed to the service, with OAuth client secrets already resolved. */
export type ResolvedGitHubConfig = Omit<WithResolvedSecrets<ParsedGitHubConfig, "clientId" | "clientSecret">, "clientId" | "clientSecret" | "accounts"> & {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  accounts: Record<string, ResolvedGitHubAccount>;
};

export type GitHubAccount = z.input<typeof GitHubAccountSchema>;
export type GitHubStoredToken = z.input<typeof GitHubStoredTokenSchema>;

export const GitHubPackageConfigSchema = z.object({
  github: GitHubConfigSchema.prefault({}),
});

export type GitHubPackageConfig = z.input<typeof GitHubPackageConfigSchema>;
