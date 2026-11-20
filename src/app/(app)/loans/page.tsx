import { BookOpen, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BookCover } from "@/components/books/book-cover";
import { MyHoldsList, MyLoansList, type HoldItem, type LoanItem } from "@/components/loans/my-loans-list";
import { ReadyHoldNotice } from "@/components/loans/ready-hold-notice";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { MAX_RENEWALS } from "@/lib/config";
import { requireUser } from "@/server/auth/session";
import { listMyHolds } from "@/server/services/holds";
import { listMyLoanHistory, listMyLoans } from "@/server/services/loans";
import { daysBetween, formatShortDate, isOverdue } from "@/server/services/rules";

export const metadata: Metadata = { title: "My loans" };

export default async function MyLoansPage() {
  const user = await requireUser();
  const [loans, holds, history] = await Promise.all([
    listMyLoans(user.id),
    listMyHolds(user.id),
    listMyLoanHistory(user.id, 8),
  ]);
  const now = new Date();

  const loanItems: LoanItem[] = loans.map((loan) => ({
    id: loan.id,
    bookId: loan.bookId,
    title: loan.title,
    authors: loan.authors,
    coverUrl: loan.coverUrl,
    dueLabel: formatShortDate(loan.dueAt),
    daysLeft: daysBetween(now, loan.dueAt),
    overdue: isOverdue(loan, now),
    renewBlockedReason:
      loan.renewCount >= MAX_RENEWALS
        ? "Already renewed once"
        : loan.waitingHolds > 0
          ? "Someone is waiting for this book"
          : null,
  }));

  const holdItems: HoldItem[] = holds.map((hold) => ({
    id: hold.id,
    bookId: hold.bookId,
    title: hold.title,
    authors: hold.authors,
    coverUrl: hold.coverUrl,
    status: hold.status,
    readyLabel: hold.readyUntil ? formatShortDate(hold.readyUntil) : null,
    position: hold.position,
  }));

  const overdue = loanItems.filter((loan) => loan.overdue).length;

  return (
    <div className="mx-auto max-w-[900px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader
        title="My loans & holds"
        description={
          overdue > 0
            ? `${overdue} overdue. Please bring ${overdue === 1 ? "it" : "them"} back when you can.`
            : "Renew once if nobody is waiting. Holds are kept for 3 days once they're ready."
        }
      />
      <ReadyHoldNotice holds={holds} />

      <section aria-labelledby="loans-heading">
        <h2 id="loans-heading" className="mb-3 flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.02em]">
          On loan <span className="text-ink-3">{loanItems.length}</span>
        </h2>
        {loanItems.length > 0 ? (
          <MyLoansList loans={loanItems} />
        ) : (
          <div className="rounded-2xl border border-dashed border-input bg-surface px-6 py-10 text-center">
            <BookOpen className="mx-auto size-7 text-ink-3" aria-hidden />
            <p className="mt-3 font-bold">Nothing on loan right now</p>
            <p className="mt-1 text-[15px] text-ink-2">Find something good and it will show up here.</p>
            <Button asChild className="mt-4">
              <Link href="/">Browse the catalog</Link>
            </Button>
          </div>
        )}
      </section>

      <section aria-labelledby="holds-heading" className="mt-10">
        <h2 id="holds-heading" className="mb-3 flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.02em]">
          Holds <span className="text-ink-3">{holdItems.length}</span>
        </h2>
        {holdItems.length > 0 ? (
          <MyHoldsList holds={holdItems} />
        ) : (
          <p className="rounded-2xl border border-border bg-surface px-5 py-4 text-[15px] text-ink-2">
            No holds. When every copy of a book is out, place a hold and we&apos;ll keep the next one for you.
          </p>
        )}
      </section>

      {history.length > 0 && (
        <section aria-labelledby="history-heading" className="mt-10">
          <h2 id="history-heading" className="mb-3 flex items-center gap-2 text-[20px] font-extrabold tracking-[-0.02em]">
            <Clock className="size-5 text-ink-3" aria-hidden /> Recently returned
          </h2>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {history.map((loan) => (
              <li key={loan.id}>
                <Link
                  href={`/books/${loan.bookId}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 hover:border-accent-border"
                >
                  <BookCover title={loan.title} coverUrl={loan.coverUrl} size="xs" />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{loan.title}</span>
                    <span className="block text-[13px] text-ink-3">
                      Returned {loan.returnedAt ? formatShortDate(loan.returnedAt) : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
