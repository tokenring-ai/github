import type { GitHubLabel } from "@tokenring-ai/github/types";
import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import { X } from "lucide-react";

/** Whether dark text reads better than light on a `rrggbb` background. */
function prefersDarkText(hex: string): boolean {
  if (!/^[0-9a-f]{6}$/i.test(hex)) return true;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  // Relative luminance, good enough for picking a text tone.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

/** A GitHub label in its own color, matching how GitHub renders it. */
export default function LabelChip({
  label,
  size = "sm",
  onRemove,
  className,
}: {
  label: Pick<GitHubLabel, "name" | "color" | "description">;
  size?: "xs" | "sm" | undefined;
  onRemove?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const hex = label.color || "9ca3af";
  const dark = prefersDarkText(hex);
  return (
    <span
      title={label.description ?? undefined}
      style={{ backgroundColor: `#${hex}`, color: dark ? "#111827" : "#f9fafb" }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium leading-none max-w-full",
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        className,
      )}
    >
      <span className="truncate">{label.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onRemove();
          }}
          className="rounded-full opacity-70 hover:opacity-100 cursor-pointer focus-ring"
          aria-label={`Remove label ${label.name}`}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
