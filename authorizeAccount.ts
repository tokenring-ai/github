import type Agent from "@tokenring-ai/agent/Agent";
import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import WebHostService from "@tokenring-ai/web-host/WebHostService";
import GitHubService, { GITHUB_OAUTH_CALLBACK_PATH } from "./GitHubService.ts";

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

/** Ends the wait as soon as the agent is cancelled, rather than sitting on the browser. */
function rejectWhenAborted(signal: AbortSignal): { promise: Promise<never>; dispose: () => void } {
  let dispose = () => {};

  const promise = new Promise<never>((_resolve, reject) => {
    const abort = () => reject(new CommandFailedError("GitHub authorization was cancelled"));
    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener("abort", abort, { once: true });
    dispose = () => signal.removeEventListener("abort", abort);
  });

  return { promise, dispose };
}

/** Accepts either the bare `code` or the whole callback URL pasted back by the user. */
export function extractAuthorizationCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new CommandFailedError("GitHub auth cancelled");

  if (trimmed.includes("://")) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new CommandFailedError("The GitHub callback URL is invalid");
    }

    const code = parsed.searchParams.get("code");
    if (!code) throw new CommandFailedError("The GitHub callback URL does not contain an authorization code");
    return code;
  }

  return trimmed;
}

/**
 * Runs the GitHub OAuth web flow for an already-configured account: prints the
 * authorization URL, waits for the local web host to receive the callback, and
 * exchanges the code for a token stored in the vault.
 */
export default async function authorizeAccount(agent: Agent, accountName: string): Promise<string> {
  const gitHubService = agent.requireService(GitHubService);
  const webHostService = agent.requireService(WebHostService);

  void gitHubService.requireAccount(accountName);

  const redirectUri = new URL(GITHUB_OAUTH_CALLBACK_PATH, `http://127.0.0.1:${webHostService.getURL().port}`).toString();
  const { authorizationUrl, waitForCallback } = gitHubService.beginAuthorization(accountName, redirectUri, { timeoutMs: CALLBACK_TIMEOUT_MS });

  agent.chatOutput(
    [
      `Open this URL to sign in to GitHub for ${accountName}`,
      authorizationUrl,
      "",
      `TokenRing is listening for the OAuth callback at ${redirectUri}.`,
      "Make sure this URL is registered as an authorization callback URL on your GitHub OAuth app.",
    ].join("\n"),
  );

  const cancellation = rejectWhenAborted(agent.getAbortSignal());
  let callbackUrl: string;
  try {
    callbackUrl = await agent.busyWithActivity(`Waiting for GitHub OAuth callback for ${accountName}`, Promise.race([waitForCallback, cancellation.promise]));
  } finally {
    cancellation.dispose();
    // If cancellation won the race, the callback promise still settles later on
    // its own timeout, and nothing would be listening for the rejection.
    void waitForCallback.catch(() => {});
  }

  const code = extractAuthorizationCode(callbackUrl);
  const { isAuthenticated, profile } = await gitHubService.exchangeAuthorizationCode(accountName, code, redirectUri);

  if (!isAuthenticated) {
    throw new CommandFailedError(`GitHub account "${accountName}" authentication failed`);
  }

  return `GitHub account "${accountName}" authenticated as ${profile?.login ?? "unknown"}.`;
}
