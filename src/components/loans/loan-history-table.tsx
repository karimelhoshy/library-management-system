import type { LoanRow } from "@/server/services/loans";
import { formatShortDate, isOverdue } from "@/server/services/rules";

/** Recent loans of one book (librarian view). Becomes a list on phones. */
export function LoanHistoryTable({ loans }: { loans: LoanRow[] }) {
  return (
    <section aria-labelledby="history-heading" className="rounded-2xl border border-border bg-surface p-5">
      <h2 id="history-heading" className="text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">
        Loan history
      </h2>
      {loans.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-2">Nobody has borrowed this book yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {loans.map((loan) => {
            const overdue = isOverdue(loan);
            return (
              <li key={loan.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[15px]">
                <span className="font-semibold">{loan.memberName ?? loan.memberEmail}</span>
                <span className="text-ink-2">
                  {formatShortDate(loan.borrowedAt)} →{" "}
                  {loan.returnedAt ? (
                    formatShortDate(loan.returnedAt)
                  ) : (
                    <span className={overdue ? "font-semibold text-destructive" : "font-semibold text-warning"}>
                      {overdue ? `overdue since ${formatShortDate(loan.dueAt)}` : `due ${formatShortDate(loan.dueAt)}`}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
