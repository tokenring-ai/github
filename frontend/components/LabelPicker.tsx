import type { GitHubLabel } from "@tokenring-ai/github/types";
import InlineDropdown from "@tokenring-ai/one-frontend/components/ui/InlineDropdown.tsx";
import { Check, Loader2, Tag } from "lucide-react";
import LabelChip from "./LabelChip.tsx";

export interface LabelPickerProps {
  available: GitHubLabel[] | undefined;
  loading?: boolean | undefined;
  selected: readonly string[];
  busy?: boolean | undefined;
  disabled?: boolean | undefined;
  onToggle: (name: string, currentlySelected: boolean) => void;
}

/** Checklist of the repository's labels; toggling applies immediately. */
export default function LabelPicker({ available, loading = false, selected, busy = false, disabled = false, onToggle }: LabelPickerProps) {
  return (
    <InlineDropdown
      header="Labels"
      width="w-64"
      align="left"
      disabled={disabled}
      aria-label="Edit labels"
      trigger={
        <>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Tag className="w-3 h-3" />}
          Labels
        </>
      }
    >
      <div className="max-h-72 overflow-y-auto py-1" role="group" aria-label="Labels">
        {loading && <p className="px-3 py-2 text-xs text-muted">Loading labels…</p>}
        {available?.length === 0 && <p className="px-3 py-2 text-xs text-muted">This repository has no labels.</p>}
        {available?.map(label => {
          const isSelected = selected.includes(label.name);
          return (
            <button
              key={label.name}
              type="button"
              role="menuitemcheckbox"
              aria-checked={isSelected}
              disabled={busy}
              onClick={() => onToggle(label.name, isSelected)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-hover transition-colors cursor-pointer disabled:opacity-50 focus-ring"
            >
              <span className="w-4 shrink-0">{isSelected && <Check className="w-3.5 h-3.5 text-accent" />}</span>
              <LabelChip label={label} size="xs" />
              {label.description && <span className="text-[11px] text-muted truncate ml-auto">{label.description}</span>}
            </button>
          );
        })}
      </div>
    </InlineDropdown>
  );
}
