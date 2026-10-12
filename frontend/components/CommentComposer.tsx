import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import { Loader2, Send } from "lucide-react";
import { useId } from "react";

export interface CommentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean | undefined;
  disabled?: boolean | undefined;
  placeholder?: string | undefined;
  submitLabel?: string | undefined;
  label?: string | undefined;
  className?: string | undefined;
}

/** Markdown comment box; Cmd/Ctrl+Enter submits. */
export default function CommentComposer({
  value,
  onChange,
  onSubmit,
  busy = false,
  disabled = false,
  placeholder = "Leave a comment…",
  submitLabel = "Comment",
  label = "Comment",
  className,
}: CommentComposerProps) {
  const id = useId();
  const canSubmit = !busy && !disabled && value.trim().length > 0;

  return (
    <div className={cn("rounded-xl border border-primary bg-secondary", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canSubmit) {
            event.preventDefault();
            onSubmit();
          }
        }}
        disabled={disabled || busy}
        placeholder={placeholder}
        rows={4}
        className="w-full bg-transparent px-3 py-2 text-sm text-primary placeholder-muted resize-y min-h-24 focus:outline-none disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-primary">
        <span className="text-[11px] text-muted">Markdown supported · ⌘/Ctrl+Enter to send</span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="flex items-center gap-1.5 px-3 py-1.5 btn-accent text-xs font-semibold rounded-lg transition-colors focus-ring cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {busy ? "Sending…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
