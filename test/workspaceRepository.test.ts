import { describe, expect, it } from "bun:test";
import { parseGitHubRemote, readWorkspaceRepository } from "../workspaceRepository.ts";

describe("parseGitHubRemote", () => {
  it.each([
    ["https://github.com/tokenring-ai/one.git", "github.com"],
    ["https://github.com/tokenring-ai/one", "github.com"],
    ["https://user@github.com/tokenring-ai/one/", "github.com"],
    ["git@github.com:tokenring-ai/one.git", "github.com"],
    ["git@github.com:tokenring-ai/one", "github.com"],
    ["ssh://git@github.com/tokenring-ai/one.git", "github.com"],
    ["git://github.com/tokenring-ai/one.git", "github.com"],
    ["git@ghe.example.com:tokenring-ai/one.git", "ghe.example.com"],
  ])("parses %s", (remote, host) => {
    expect(parseGitHubRemote(remote)).toEqual({ host, owner: "tokenring-ai", repo: "one", remoteUrl: remote });
  });

  it("rejects remotes that are not a two-segment repository path", () => {
    expect(parseGitHubRemote("")).toBeNull();
    expect(parseGitHubRemote("https://github.com/tokenring-ai")).toBeNull();
    expect(parseGitHubRemote("https://github.com/a/b/c")).toBeNull();
    expect(parseGitHubRemote("/srv/git/one.git")).toBeNull();
    expect(parseGitHubRemote("not a url")).toBeNull();
  });
});

describe("readWorkspaceRepository", () => {
  it("resolves to null outside a git checkout", async () => {
    expect(await readWorkspaceRepository("/")).toBeNull();
  });

  it("reads this checkout's origin", async () => {
    // The plugin lives in a submodule whose origin is the github plugin repository.
    const repository = await readWorkspaceRepository(import.meta.dir);
    if (repository === null) return; // A tarball checkout has no origin; nothing to assert.
    expect(repository.owner).toBeTruthy();
    expect(repository.repo).toBeTruthy();
  });
});
