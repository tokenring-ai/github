import type {TokenRingService} from "@tokenring-ai/app/types";
import {HttpService} from "@tokenring-ai/utility/http/HttpService";
import type {z} from "zod";
import type {GitHubConfigSchema} from "./schema.ts";

export type GitHubRepoSearchResult = {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  default_branch: string;
};

type GitHubRepository = {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  stargazers_count: number;
  language: string | null;
};

type GitHubContentsResponse = {
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  content?: string;
  encoding?: string;
  download_url?: string | null;
};

type GitHubTreeResponse = {
  tree?: Array<{
    path: string;
    type: "blob" | "tree";
    size?: number;
  }>;
};

export default class GitHubService
  extends HttpService
  implements TokenRingService {
  readonly name = "GitHubService";
  description =
    "Search GitHub repositories and retrieve repository documentation and files";

  protected baseUrl: string;
  protected defaultHeaders: Record<string, string>;

  constructor(readonly options: z.output<typeof GitHubConfigSchema>) {
    super();
    this.baseUrl = options.baseUrl;
    this.defaultHeaders = {
      Accept: "application/vnd.github+json",
      "User-Agent": options.userAgent,
      ...(options.token ? {Authorization: `Bearer ${options.token}`} : {}),
    };
  }

  async searchRepositories(
    query: string,
    options: {
      limit?: number;
      sort?: "stars" | "updated";
      order?: "asc" | "desc";
    } = {},
  ): Promise<GitHubRepoSearchResult[]> {
    if (!query.trim()) throw new Error("query is required");
    const params = new URLSearchParams({
      q: query,
      per_page: String(options.limit ?? 10),
      sort: options.sort ?? "stars",
      order: options.order ?? "desc",
    });

    const response = await this.fetchJson(
      `/search/repositories?${params.toString()}`,
      {method: "GET"},
      "GitHub repository search",
    );
    return (response.items ?? []).map((repo: GitHubRepository) => ({
      full_name: repo.full_name,
      description: repo.description,
      html_url: repo.html_url,
      stargazers_count: repo.stargazers_count,
      language: repo.language,
      default_branch: repo.default_branch,
    }));
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return await this.fetchJson(
      `/repos/${owner}/${repo}`,
      {method: "GET"},
      `GitHub repository lookup for ${owner}/${repo}`,
    );
  }

  async getFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<{ path: string; content: string; sha: string; size: number }> {
    const params = new URLSearchParams();
    if (ref) params.set("ref", ref);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = (await this.fetchJson(
      `/repos/${owner}/${repo}/contents/${path}${suffix}`,
      {method: "GET"},
      `GitHub file retrieval for ${owner}/${repo}:${path}`,
    )) as GitHubContentsResponse;

    if (response.type !== "file") {
      throw new Error(`Path ${path} in ${owner}/${repo} is not a file`);
    }
    if (response.encoding !== "base64" || !response.content) {
      throw new Error(
        `Path ${path} in ${owner}/${repo} did not return base64 file content`,
      );
    }

    return {
      path: response.path,
      content: Buffer.from(
        response.content.replace(/\n/g, ""),
        "base64",
      ).toString("utf8"),
      sha: response.sha,
      size: response.size,
    };
  }

  async getRepositoryDocumentation(
    owner: string,
    repo: string,
    options: { ref?: string; maxFiles?: number } = {},
  ): Promise<{
    repository: string;
    branch: string;
    files: Array<{ path: string; size: number; content: string }>;
  }> {
    const repository = await this.getRepository(owner, repo);
    const branch = options.ref ?? repository.default_branch;
    const tree = (await this.fetchJson(
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      {method: "GET"},
      `GitHub tree retrieval for ${owner}/${repo}`,
    )) as GitHubTreeResponse;

    const candidates = this.rankDocumentationFiles(tree.tree ?? []);
    const maxFiles = options.maxFiles ?? 5;
    const selected = candidates.slice(0, maxFiles);
    if (selected.length === 0) {
      throw new Error(`No documentation files found for ${owner}/${repo}`);
    }

    const files = await Promise.all(
      selected.map((file) => this.getFile(owner, repo, file.path, branch)),
    );
    return {
      repository: `${owner}/${repo}`,
      branch,
      files: files.map((file) => ({
        path: file.path,
        size: file.size,
        content: file.content,
      })),
    };
  }

  private rankDocumentationFiles(
    files: Array<{ path: string; type: "blob" | "tree"; size?: number }>,
  ): Array<{ path: string; size: number }> {
    return files
      .filter((file) => file.type === "blob")
      .filter((file) => {
        const lower = file.path.toLowerCase();
        return (
          lower === "readme.md" ||
          lower === "readme.mdx" ||
          lower.startsWith("docs/") ||
          lower === "documentation.md" ||
          lower.endsWith("/readme.md") ||
          lower.endsWith("/readme.mdx") ||
          lower.endsWith(".md") ||
          lower.endsWith(".mdx")
        );
      })
      .map((file) => ({
        path: file.path,
        size: file.size ?? 0,
        rank: this.documentationRank(file.path),
      }))
      .sort((a, b) => a.rank - b.rank || a.path.localeCompare(b.path))
      .map((file) => ({path: file.path, size: file.size}));
  }

  private documentationRank(path: string): number {
    const lower = path.toLowerCase();
    if (lower === "readme.md" || lower === "readme.mdx") return 0;
    if (lower === "docs/readme.md" || lower === "docs/readme.mdx") return 1;
    if (lower === "docs/index.md" || lower === "docs/index.mdx") return 2;
    if (lower.startsWith("docs/")) return 3;
    return 4;
  }
}
