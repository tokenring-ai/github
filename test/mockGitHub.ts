import { mock } from "bun:test";

export type RecordedRequest = { method: string; url: string; body: unknown; headers: Record<string, string> };

/**
 * Routes GitHub API calls to canned responses and records what was sent.
 * A string route value is served as a unified diff instead of JSON.
 * Longest matching key wins, so `/issues/1/labels` beats `/issues`.
 */
export function mockGitHub(routes: Record<string, unknown>): RecordedRequest[] {
  const requests: RecordedRequest[] = [];

  const handler = mock(async (input: unknown, init?: unknown) => {
    const url = typeof input === "string" ? input : String((input as Request).url);
    const options = (init ?? {}) as { method?: string; body?: string; headers?: Record<string, string> };
    const method = options.method ?? "GET";

    requests.push({
      method,
      url,
      body: options.body ? JSON.parse(options.body) : undefined,
      headers: options.headers ?? {},
    });

    const match = Object.keys(routes)
      .filter(key => url.startsWith(`https://api.github.com${key}`))
      .sort((a, b) => b.length - a.length)[0];

    if (match === undefined) throw new Error(`Unexpected fetch to ${method} ${url}`);

    const payload = routes[match];
    if (typeof payload === "string") {
      return new Response(payload, { status: 200, headers: { "content-type": "application/vnd.github.diff; charset=utf-8" } });
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  });

  (globalThis as { fetch: unknown }).fetch = handler;
  return requests;
}
