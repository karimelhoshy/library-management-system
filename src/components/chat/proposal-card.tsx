"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { ChatProposal, MiniBook } from "@/lib/chat-types";
import { useChat } from "./chat-provider";
import { MiniBookCard } from "./mini-book-card";

const PROPOSAL_LABEL: Record<ChatProposal["kind"], string> = {
  place_hold: "Place hold",
  borrow_book: "Borrow",
  renew_loan: "Renew",
};

/** The confirm card for a write action the librarian suggested. Nothing happens until it's pressed. */
export function ProposalCard({
  messageId,
  proposal,
  book,
}: {
  messageId: string;
  proposal: ChatProposal;
  book?: MiniBook;
}) {
  const { resolveProposal } = useChat();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<"confirm" | "dismiss" | null>(null);
  const decide = (decision: "confirm" | "dismiss") => {
    setChoice(decision);
    startTransition(() => resolveProposal(messageId, proposal.id, decision));
  };

  const body = (
    <div className="mt-3">
      <p className="text-sm text-ink-2">{proposal.detail}</p>
      {proposal.status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => decide("confirm")} disabled={pending}>
            {pending && choice === "confirm" && <Loader2 className="animate-spin" />}
            {PROPOSAL_LABEL[proposal.kind]}
          </Button>
          <Button variant="outline" onClick={() => decide("dismiss")} disabled={pending}>
            Not now
          </Button>
        </div>
      ) : (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-xl px-3 py-2 text-sm font-semibold",
            proposal.status === "confirmed" && "bg-success-bg text-success",
            proposal.status === "dismissed" && "bg-muted text-ink-2",
            proposal.status === "failed" && "bg-destructive-bg text-destructive",
          )}
        >
          {proposal.resultMessage ?? (proposal.status === "dismissed" ? "No problem, I left it." : "Done.")}
        </p>
      )}
    </div>
  );

  if (book) return <MiniBookCard book={book}>{body}</MiniBookCard>;
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="text-[15px] font-bold">{proposal.title}</p>
      {body}
    </div>
  );
}
