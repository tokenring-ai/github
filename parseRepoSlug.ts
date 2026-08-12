import { CommandFailedError } from "@tokenring-ai/agent/AgentError";

/** Splits an `<owner>/<repo>` slug, rejecting anything with extra path segments. */
export default function parseRepoSlug(slug: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = slug.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new CommandFailedError("Repository must be in <owner>/<repo> format");
  }
  return { owner, repo };
}
