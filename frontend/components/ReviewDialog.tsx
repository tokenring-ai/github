import ModalShell from "@tokenring-ai/one-frontend/components/ui/ModalShell.tsx";
import { cn } from "@tokenring-ai/one-frontend/lib/utils.ts";
import { useState } from "react";

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

const OPTIONS: { value: ReviewEvent; label: string; hint: string; tone: string }[] = [
  { value: "COMMENT", label: "Comment", hint: "General feedback without explicit approval", tone: "border-primary" },
  { value: "APPROVE", label: "Approve", hint: "Submit feedback and approve merging these changes", tone: "border-emerald-500/60" },
  { value: "REQUEST_CHANGES", label: "Request changes", hint: "Submit feedback that must be addressed before merging", tone: "border-red-500/60" },
];

export interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (event: ReviewEvent, body: string) => Promise<void> | void;
  busy?: boolean | undefined;
}

/** Approve, request changes or comment on a pull request. */
export default function ReviewDialog({ open, onClose, onSubmit, busy = false }: ReviewDialogProps) {
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const [body, setBody] = useState("");
  // GitHub rejects a plain comment review without a body; approvals may be silent.
  const bodyRequired = event !== "APPROVE";
  const canSubmit = !busy && (!bodyRequired || body.trim().length > 0);

  return (
    <ModalShell
      open={open}
      title="Review pull request"
      onClose={onClose}
      busy={busy}
      confirmLabel={busy ? "Submitting…" : "Submit review"}
      confirmDisabled={!canSubmit}
      onConfirm={() => void onSubmit(event, body.trim())}
      width="max-w-lg"
    >
      <div className="space-y-3">
        <fieldset className="space-y-2">
          <legend className="sr-only">Review type</legend>
          {OPTIONS.map(option => (
            <label
              key={option.value}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors hover:bg-hover",
                event === option.value ? cn("bg-active", option.tone) : "border-primary",
              )}
            >
              <input
                type="radio"
                name="review-event"
                value={option.value}
                checked={event === option.value}
                onChange={() => setEvent(option.value)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-primary">{option.label}</span>
                <span className="block text-xs text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="review-body" className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1">
            Summary {bodyRequired ? "" : <span className="font-normal normal-case tracking-normal">(optional)</span>}
          </label>
          <textarea
            id="review-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={5}
            disabled={busy}
            placeholder="Leave a review summary…"
            className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus-accent resize-y min-h-24 disabled:opacity-60"
          />
        </div>
      </div>
    </ModalShell>
  );
}
