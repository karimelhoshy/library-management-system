"use client";

import { Loader2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";
import { BookCover } from "@/components/books/book-cover";
import { useLoanActions } from "@/components/loans/use-loan-actions";
import { Button } from "@/components/ui/button";

export type DeskLoan = {
  id: string;
  bookId: string;
  title: string;
  coverUrl: string | null;
  memberName: string;
  memberEmail: string | null;
  borrowedLabel: string;
  dueLabel: string;
  daysLate: number;
};

/** Open loans with a Return button for each (on behalf of the member). Cards on phones. */
export function LoanDeskList({ loans, compact = false }: { loans: DeskLoan[]; compact?: boolean }) {
  const actions = useLoanActions();
  const [returning, setReturning] = useState<string | null>(null);

  return (
    <ul className="flex flex-col divide-y divide-border">
      {loans.map((loan) => (
        <li key={loan.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
          <Link href={`/books/${loan.bookId}`} className="flex min-w-0 flex-1 items-center gap-3">
            <BookCover title={loan.title} coverUrl={loan.coverUrl} size="xs" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold hover:text-accent-foreground">{loan.title}</span>
              <span className="block truncate text-[13px] text-ink-2">
                {loan.memberName}
                {!compact && loan.memberEmail ? ` · ${loan.memberEmail}` : ""}
              </span>
            </span>
          </Link>
          {!compact && <span className="hidden text-[13px] text-ink-3 md:block">Borrowed {loan.borrowedLabel}</span>}
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-bold",
              loan.daysLate > 0 ? "bg-destructive-bg text-destructive" : "bg-secondary text-ink-2",
            )}
          >
            {loan.daysLate > 0 ? `${loan.daysLate}d late` : `Due ${loan.dueLabel}`}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={actions.pending}
            onClick={async () => {
              setReturning(loan.id);
              await actions.returnLoan(loan.id);
              setReturning(null);
            }}
            className="shrink-0"
          >
            {returning === loan.id ? <Loader2 className="animate-spin" /> : <Undo2 />} Return
          </Button>
        </li>
      ))}
    </ul>
  );
}
