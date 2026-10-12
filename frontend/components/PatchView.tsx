import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";

export type PatchLineType = "hunk" | "add" | "del" | "context" | "meta";

export interface PatchLine {
  type: PatchLineType;
  /** The line without its leading marker. */
  text: string;
  oldLine?: number | undefined;
  newLine?: number | undefined;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Splits a unified diff (GitHub's per-file `patch`) into typed lines with
 * old/new line numbers. Tolerates the truncation marker the backend appends
 * to oversized patches by rendering unknown lines as `meta`.
 */
export function parsePatch(patch: string): PatchLine[] {
  const lines: PatchLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split("\n")) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      lines.push({ type: "hunk", text: raw });
      continue;
    }
    const marker = raw[0];
    const text = raw.slice(1);
    if (marker === "+") {
      lines.push({ type: "add", text, newLine });
      newLine += 1;
    } else if (marker === "-") {
      lines.push({ type: "del", text, oldLine });
      oldLine += 1;
    } else if (marker === " ") {
      lines.push({ type: "context", text, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    } else if (raw === "") {
      // A trailing newline; skip it rather than rendering an empty context row.
    } else {
      lines.push({ type: "meta", text: raw });
    }
  }
  return lines;
}

const ROW_CLASSES: Record<PatchLineType, string> = {
  hunk: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  add: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  del: "bg-red-500/10 text-red-700 dark:text-red-300",
  context: "text-secondary",
  meta: "text-muted italic",
};

const MARKERS: Record<PatchLineType, string> = { hunk: "", add: "+", del: "-", context: " ", meta: "" };

/** Renders one file's unified diff with line numbers and add/remove coloring. */
export default function PatchView({ patch, className }: { patch: string; className?: string | undefined }) {
  const lines = parsePatch(patch);
  return (
    <div className={cn("overflow-x-auto text-xs font-mono leading-5", className)} data-testid="patch-view">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} className={ROW_CLASSES[line.type]}>
              <td className="w-10 pr-2 text-right select-none text-muted/70 align-top">{line.oldLine ?? ""}</td>
              <td className="w-10 pr-2 text-right select-none text-muted/70 align-top">{line.newLine ?? ""}</td>
              <td className="w-4 select-none align-top">{MARKERS[line.type]}</td>
              <td className="whitespace-pre align-top pr-3">{line.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
