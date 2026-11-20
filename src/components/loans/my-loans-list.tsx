"use client";

import { Loader2, RefreshCw, Undo2, X } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { BookCover } from "@/components/books/book-cover";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLoanActions } from "./use-loan-actions";

export type LoanItem = {
  id: string;
  bookId: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  dueLabel: string;
  daysLeft: number;
  overdue: boolean;
  renewBlockedReason: string | null;
};

export type HoldItem = {
  id: string;
  bookId: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  status: "waiting" | "ready";
  readyLabel: string | null;
  position: number | null;
};

function dueText(loan: LoanItem) {
  if (loan.overdue) {
    const days = -loan.daysLeft;
    return `Overdue · ${days <= 1 ? "1 day" : `${days} days`} late (due ${loan.dueLabel})`;
  }
  if (loan.daysLeft <= 0) return `Due today`;
  if (loan.daysLeft <= 2) return `Due in ${loan.daysLeft === 1 ? "1 day" : `${loan.daysLeft} days`} · ${loan.dueLabel}`;
  return `Due ${loan.dueLabel}`;
}

function Row({
  bookId,
  title,
  authors,
  coverUrl,
  children,
  status,
}: {
  bookId: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  status: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3.5 sm:flex-row sm:items-center">
      <Link href={`/books/${bookId}`} className="flex min-w-0 flex-1 items-center gap-4 rounded-xl">
        <BookCover title={title} coverUrl={coverUrl} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-[17px] font-bold tracking-[-0.015em] hover:text-accent-foreground">
            {title}
          </span>
          <span className="block truncate text-[15px] text-ink-2">{authors.join(", ")}</span>
          <span className="mt-1 block">{status}</span>
        </span>
      </Link>
      <div className="flex shrink-0 gap-2 sm:justify-end">{children}</div>
    </li>
  );
}

export function MyLoansList({ loans }: { loans: LoanItem[] }) {
  const actions = useLoanActions();
  return (
    <ul className="flex flex-col gap-3">
      {loans.map((loan) => (
        <Row
          key={loan.id}
          bookId={loan.bookId}
          title={loan.title}
          authors={loan.authors}
          coverUrl={loan.coverUrl}
          status={
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-bold",
                loan.overdue
                  ? "bg-destructive-bg text-destructive"
                  : loan.daysLeft <= 2
                    ? "bg-warning-bg text-warning"
                    : "bg-success-bg text-success",
              )}
            >
              {dueText(loan)}
            </span>
          }
        >
          {loan.renewBlockedReason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="flex-1 sm:flex-none">
                  <Button variant="outline" disabled className="w-full">
                    <RefreshCw /> Renew
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{loan.renewBlockedReason}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={actions.pending}
              onClick={() => actions.renew(loan.id)}
            >
              <RefreshCw /> Renew
            </Button>
          )}
          <Button className="flex-1 sm:flex-none" disabled={actions.pending} onClick={() => actions.returnLoan(loan.id)}>
            {actions.pending ? <Loader2 className="animate-spin" /> : <Undo2 />} Return
          </Button>
        </Row>
      ))}
    </ul>
  );
}

export function MyHoldsList({ holds }: { holds: HoldItem[] }) {
  const actions = useLoanActions();
  return (
    <ul className="flex flex-col gap-3">
      {holds.map((hold) => (
        <Row
          key={hold.id}
          bookId={hold.bookId}
          title={hold.title}
          authors={hold.authors}
          coverUrl={hold.coverUrl}
          status={
            hold.status === "ready" ? (
              <span className="inline-flex rounded-full bg-accent px-2.5 py-0.5 text-[13px] font-bold text-accent-foreground">
                Ready to pick up{hold.readyLabel ? ` until ${hold.readyLabel}` : ""}
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-[13px] font-bold text-ink-2">
                {hold.position === 1 ? "First in line" : `#${hold.position} in line`}
              </span>
            )
          }
        >
          {hold.status === "ready" && (
            <Button className="flex-1 sm:flex-none" disabled={actions.pending} onClick={() => actions.borrow(hold.bookId)}>
              Borrow now
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            disabled={actions.pending}
            onClick={() => actions.cancelHold(hold.id)}
          >
            <X /> Cancel hold
          </Button>
        </Row>
      ))}
    </ul>
  );
}
