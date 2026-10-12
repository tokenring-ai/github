import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import PatchView, { parsePatch } from "./PatchView.tsx";

const PATCH = ["@@ -1,3 +1,4 @@", " const a = 1;", "-const b = 2;", "+const b = 3;", "+const c = 4;", " export {};", "\\ No newline at end of file"].join("\n");

describe("parsePatch", () => {
  it("types each line and tracks old/new line numbers per hunk", () => {
    expect(parsePatch(PATCH)).toEqual([
      { type: "hunk", text: "@@ -1,3 +1,4 @@" },
      { type: "context", text: "const a = 1;", oldLine: 1, newLine: 1 },
      { type: "del", text: "const b = 2;", oldLine: 2 },
      { type: "add", text: "const b = 3;", newLine: 2 },
      { type: "add", text: "const c = 4;", newLine: 3 },
      { type: "context", text: "export {};", oldLine: 3, newLine: 4 },
      { type: "meta", text: "\\ No newline at end of file" },
    ]);
  });

  it("restarts numbering at every hunk header", () => {
    const lines = parsePatch("@@ -10 +20 @@\n-x\n+y\n@@ -30,2 +40,2 @@\n z");
    expect(lines.map(line => [line.type, line.oldLine, line.newLine])).toEqual([
      ["hunk", undefined, undefined],
      ["del", 10, undefined],
      ["add", undefined, 20],
      ["hunk", undefined, undefined],
      ["context", 30, 40],
    ]);
  });
});

describe("PatchView", () => {
  it("renders the diff as rows with markers", () => {
    render(<PatchView patch={PATCH} />);
    expect(screen.getByTestId("patch-view")).toBeInTheDocument();
    expect(screen.getByText("const b = 3;")).toBeInTheDocument();
    expect(screen.getAllByText("+")).toHaveLength(2);
    expect(screen.getAllByText("-")).toHaveLength(1);
  });
});
