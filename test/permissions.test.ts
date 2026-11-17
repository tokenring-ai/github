import { describe, expect, it, mock } from "bun:test";
import type Agent from "@tokenring-ai/agent/Agent";
import ChatService from "@tokenring-ai/chat/ChatService";
import { permissionSlug } from "@tokenring-ai/chat/permissions/permissionIds";
import GitHubService from "../GitHubService.ts";
import addLabels from "../tools/addLabels.ts";
import addPRReviewers from "../tools/addPRReviewers.ts";
import closePR from "../tools/closePR.ts";
import commentIssue from "../tools/commentIssue.ts";
import commentPR from "../tools/commentPR.ts";
import createIssue from "../tools/createIssue.ts";
import createPR from "../tools/createPR.ts";
import removeLabel from "../tools/removeLabel.ts";
import reviewPR from "../tools/reviewPR.ts";
import updateIssue from "../tools/updateIssue.ts";
import updatePR from "../tools/updatePR.ts";

type Options = { toolName: string; safetyLevel: number; permission?: { id: string; summary: string } };

/** A fake agent: approval answers `approve`; the GitHub service answers anything with an empty object. */
function fakeAgent(approve: boolean) {
  const checkToolApproval = mock(async (_options: Options) => approve);
  // Every GitHub call answers with something both list-like and record-like, so each tool can finish.
  const answer = () =>
    Object.assign([], {
      number: 1,
      title: "t",
      html_url: "u",
      id: 1,
      name: "n",
      state: "open",
      requested_reviewers: [],
      requested_teams: [],
      head: { ref: "h", sha: "s" },
      base: { ref: "b" },
    });
  const github = new Proxy({}, { get: () => async () => answer() });
  const agent = {
    requireService: (service: unknown) => {
      if (service === ChatService) return { checkToolApproval };
      if (service === GitHubService) return github;
      throw new Error("unexpected service");
    },
    infoMessage: () => {},
  } as unknown as Agent;
  return { agent, checkToolApproval };
}

const target = { owner: "Acme.Org", repo: "My Repo" };
const slug = `github.${permissionSlug("Acme.Org")}.${permissionSlug("My Repo")}`;

const cases: [string, { execute: (input: never, agent: Agent) => Promise<unknown> }, Record<string, unknown>, string, number][] = [
  ["createPR", createPR, { ...target, title: "t", head: "h", base: "main" }, "pr.create", 8],
  ["createIssue", createIssue, { ...target, title: "t" }, "issue.create", 8],
  ["commentIssue", commentIssue, { ...target, issueNumber: 1, body: "b" }, "issue.comment", 8],
  ["commentPR", commentPR, { ...target, prNumber: 1, body: "b" }, "pr.comment", 8],
  ["reviewPR", reviewPR, { ...target, prNumber: 1, event: "COMMENT", body: "b" }, "pr.review", 8],
  ["addPRReviewers", addPRReviewers, { ...target, prNumber: 1, reviewers: ["a"] }, "pr.reviewers", 8],
  ["updateIssue", updateIssue, { ...target, issueNumber: 1, title: "t" }, "issue.update", 7],
  ["updatePR", updatePR, { ...target, prNumber: 1, title: "t" }, "pr.update", 7],
  ["closePR", closePR, { ...target, prNumber: 1 }, "pr.close", 7],
  ["addLabels", addLabels, { ...target, issueNumber: 1, labels: ["bug"] }, "labels", 7],
  ["removeLabel", removeLabel, { ...target, issueNumber: 1, label: "bug" }, "labels", 7],
];

describe("github permission ids", () => {
  it.each(cases)("%s names a slugged repository permission", async (_name, tool, input, action, level) => {
    const { agent, checkToolApproval } = fakeAgent(true);
    await tool.execute(input as never, agent);
    const options = checkToolApproval.mock.calls[0]?.[0] as Options;
    expect(options.permission?.id).toBe(`${slug}.${action}`);
    expect(options.permission?.summary).toContain("Acme.Org/My Repo");
    expect(options.safetyLevel).toBe(level);
  });

  it.each(cases)("%s still refuses when declined", async (_name, tool, input) => {
    const { agent } = fakeAgent(false);
    await expect(tool.execute(input as never, agent)).rejects.toThrow(/did not approve/);
  });
});
