/**
 * Which GitHub repository the workspace is a checkout of, read from its
 * `origin` remote. The dashboard uses it to pre-select a repository; nothing
 * else in the plugin assumes a "current" repository.
 */

export type WorkspaceRepository = {
  /** Remote host, e.g. `github.com` or a GitHub Enterprise host. */
  host: string;
  owner: string;
  repo: string;
  remoteUrl: string;
};

const SCP_LIKE_REMOTE = /^(?:[\w.-]+@)?([\w.-]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/;

/**
 * Parses the `owner/repo` a git remote URL points at. Accepts the forms git
 * itself accepts: `https://host/owner/repo(.git)`, `ssh://git@host/owner/repo`,
 * `git://host/owner/repo` and the scp-like `git@host:owner/repo(.git)`.
 * Returns null for anything that is not a two-segment repository path.
 */
export function parseGitHubRemote(remoteUrl: string): WorkspaceRepository | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  if (trimmed.includes("://")) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2) return null;
    const [owner, rawRepo] = segments as [string, string];
    const repo = rawRepo.replace(/\.git$/, "");
    if (!owner || !repo) return null;
    return { host: parsed.hostname, owner, repo, remoteUrl: trimmed };
  }

  const match = SCP_LIKE_REMOTE.exec(trimmed);
  const host = match?.[1];
  const owner = match?.[2];
  const repo = match?.[3];
  if (!host || !owner || !repo) return null;
  return { host, owner, repo, remoteUrl: trimmed };
}

/**
 * Reads the workspace's `origin` remote. Resolves to null when the directory
 * is not a git checkout, has no `origin`, or git is not installed: the
 * dashboard then simply starts without a pre-selected repository.
 */
export async function readWorkspaceRepository(directory: string): Promise<WorkspaceRepository | null> {
  try {
    const process = Bun.spawn(["git", "-C", directory, "remote", "get-url", "origin"], { stdout: "pipe", stderr: "pipe" });
    const output = await new Response(process.stdout).text();
    const exitCode = await process.exited;
    if (exitCode !== 0) return null;
    return parseGitHubRemote(output);
  } catch {
    return null;
  }
}
