import type { ViewProps } from "@tokenring-ai/one-frontend/layout/define.ts";
import { kindFromSegment } from "../lib/paths.ts";
import GitHubStartPane from "./GitHubStartPane.tsx";
import IssuePane from "./IssuePane.tsx";
import PullRequestPane from "./PullRequestPane.tsx";

/** One issue or pull request per tab (`/github/<owner>/<repo>/(issues|pulls)/<number>`). */
export default function GitHubItemPane({ params }: ViewProps) {
  const { owner, repo } = params;
  const kind = kindFromSegment(params.kind);
  const number = Number(params.number);
  // A URL that is not an item (an unknown kind segment, a non-numeric number) shows the landing content.
  if (!owner || !repo || !kind || !Number.isInteger(number) || number <= 0) return <GitHubStartPane />;
  if (kind === "pull") return <PullRequestPane owner={owner} repo={repo} number={number} />;
  return <IssuePane owner={owner} repo={repo} number={number} />;
}
