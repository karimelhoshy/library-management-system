"use client";

import { BellRing, Loader2, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { cn } from "cn";
import { useChat } from "@/components/chat/chat-provider";
import { useLoanActions } from "@/components/loans/use-loan-actions";
import { Button } from "@/components/ui/button";

export type BookActionState = {
  bookId: string;
  title: string;
  available: number;
  /** Pre-formatted on the server: due date for a loan started now, e.g. "Dec 4". */
  borrowDueLabel: string;
  nextDueLabel: string | null;
  myLoanId: string | null;
  myLoanDueLabel: string | null;
  myLoanOverdue: boolean;
  myHoldId: string | null;
  myHoldStatus: "waiting" | "ready" | null;
  myHoldReadyLabel: string | null;
  myQueuePosition: number | null;
};

type Mode = "borrow" | "ready" | "onloan" | "waiting" | "hold";

function modeOf(s: BookActionState): Mode {
  if (s.myLoanId) return "onloan";
  if (s.myHoldStatus === "ready") return "ready";
  if (s.myHoldStatus === "waiting") return "waiting";
  if (s.available > 0) return "borrow";
  return "hold";
}

/**
 * The primary action for a book, from the viewer's point of view.
 * Optimistic: the button flips immediately and rolls back if the server says no.
 */
export function BookActions({ state, layout }: { state: BookActionState; layout: "inline" | "sticky" }) {
  const actions = useLoanActions();
  const chat = useChat();
  const [mode, setOptimisticMode] = useOptimistic<Mode, Mode>(modeOf(state), (_current, next) => next);
  const [busy, startTransition] = useTransition();
  /** Flip the UI right away; it settles to the server's answer when the action finishes. */
  const act = (next: Mode, fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setOptimisticMode(next);
      await fn();
    });

  const askButton = (
    <Button
      type="button"
      variant={layout === "sticky" ? "amber" : "outline"}
      size={layout === "sticky" ? "icon" : "lg"}
      className={layout === "sticky" ? "size-14 shrink-0 rounded-[14px]" : undefined}
      onClick={() => chat.ask(`Tell me about “${state.title}”. Is it a good pick for me?`)}
      disabled={!chat.aiEnabled}
      aria-label="Ask the Librarian about this book"
      title={chat.aiEnabled ? undefined : "The AI librarian is off"}
    >
      <Sparkles className={layout === "sticky" ? "size-5" : undefined} />
      {layout === "inline" && "Ask about this book"}
    </Button>
  );

  const big = layout === "sticky" ? "h-14 flex-1 rounded-[14px] text-[17px] font-extrabold" : "min-w-48";

  const primary = (() => {
    switch (mode) {
      case "borrow":
      case "ready":
        return (
          <Button
            size="lg"
            className={big}
            disabled={busy}
            onClick={() => act("onloan", () => actions.borrow(state.bookId))}
          >
            {busy && <Loader2 className="animate-spin" />}
            Borrow · due {state.borrowDueLabel}
          </Button>
        );
      case "onloan":
        return (
          <Button
            size="lg"
            variant="outline"
            className={big}
            disabled={busy || !state.myLoanId}
            onClick={() => {
              const loanId = state.myLoanId;
              if (loanId) act("borrow", () => actions.returnLoan(loanId));
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Undo2 />}
            Return
          </Button>
        );
      case "waiting":
        return (
          <Button
            size="lg"
            variant="outline"
            className={big}
            disabled={busy || !state.myHoldId}
            onClick={() => {
              const holdId = state.myHoldId;
              if (holdId) act("hold", () => actions.cancelHold(holdId));
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <X />}
            Cancel hold
          </Button>
        );
      case "hold":
        return (
          <Button
            size="lg"
            className={big}
            disabled={busy}
            onClick={() => act("waiting", () => actions.placeHold(state.bookId))}
          >
            {busy ? <Loader2 className="animate-spin" /> : <BellRing />}
            Place hold
          </Button>
        );
    }
  })();

  const note = (() => {
    switch (mode) {
      case "onloan":
        return state.myLoanDueLabel
          ? {
              tone: state.myLoanOverdue ? "danger" : "accent",
              text: state.myLoanOverdue
                ? `Overdue: it was due ${state.myLoanDueLabel}`
                : `On loan to you · due ${state.myLoanDueLabel}`,
            }
          : { tone: "accent", text: "On loan to you" };
      case "ready":
        return {
          tone: "accent",
          text: `A copy is set aside for you${state.myHoldReadyLabel ? ` until ${state.myHoldReadyLabel}` : ""}.`,
        };
      case "waiting":
        return {
          tone: "muted",
          text: state.myQueuePosition
            ? `You're #${state.myQueuePosition} in line. We'll email you when it's ready.`
            : "You're in the queue.",
        };
      case "hold":
        return {
          tone: "muted",
          text: state.nextDueLabel
            ? `All copies are out. The next one is due back ${state.nextDueLabel}.`
            : "All copies are out right now.",
        };
      default:
        return null;
    }
  })();

  const noteView = note && (
    <p
      className={cn(
        "flex items-center gap-2 text-sm font-semibold",
        note.tone === "danger" && "text-destructive",
        note.tone === "accent" && "text-accent-foreground",
        note.tone === "muted" && "font-medium text-ink-2",
      )}
    >
      {mode === "onloan" && !state.myLoanOverdue && <RotateCcw className="size-4" aria-hidden />}
      {note.text}
    </p>
  );

  if (layout === "sticky") {
    return (
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 pt-3 backdrop-blur md:hidden">
        {noteView && <div className="mb-2">{noteView}</div>}
        <div className="flex gap-3 pb-3">
          {primary}
          {askButton}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {noteView}
      <div className="flex flex-wrap gap-3">
        {primary}
        {askButton}
      </div>
    </div>
  );
}
