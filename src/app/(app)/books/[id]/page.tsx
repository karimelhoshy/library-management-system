import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookActions, type BookActionState } from "@/components/books/book-actions";
import { BookCard } from "@/components/books/book-card";
import { BookCover } from "@/components/books/book-cover";
import { BookDeskPanel } from "@/components/books/book-desk-panel";
import { LoanHistoryTable } from "@/components/loans/loan-history-table";
import { RoleSwitcher } from "@/components/shell/role-switcher";
import { LOAN_DAYS } from "@/lib/config";
import { DEMO_USERS } from "@/server/auth/demo-users";
import { can } from "@/server/auth/permissions";
import { requireUser } from "@/server/auth/session";
import { isDemoMode } from "@/server/env";
import { getBookDetail, similarBooks } from "@/server/services/catalog";
import { listBookLoanHistory } from "@/server/services/loans";
import { dueDateFrom, formatShortDate, isOverdue } from "@/server/services/rules";
import { listMembers } from "@/server/services/users";
import { getBook } from "@/server/services/books";

export async function generateMetadata({ params }: PageProps<"/books/[id]">): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(id);
  if (!book) return { title: "Book not found" };
  return {
    title: book.title,
    description: book.summary ?? book.description?.slice(0, 160) ?? undefined,
  };
}

export default async function BookPage({ params }: PageProps<"/books/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const book = await getBookDetail(id, user.id);
  if (!book) notFound();

  const isStaff = can(user, "loan:any");
  const [history, members, similar] = await Promise.all([
    isStaff ? listBookLoanHistory(user, book.id) : Promise.resolve([]),
    can(user, "loan:any") ? listMembers(user) : Promise.resolve([]),
    similarBooks(book.id, user.id, 4),
  ]);

  const now = new Date();
  const actionState: BookActionState = {
    bookId: book.id,
    title: book.title,
    available: book.available,
    borrowDueLabel: formatShortDate(dueDateFrom(now)),
    nextDueLabel: book.nextDueAt ? formatShortDate(book.nextDueAt) : null,
    myLoanId: book.myLoanId,
    myLoanDueLabel: book.myLoanDueAt ? formatShortDate(book.myLoanDueAt) : null,
    myLoanOverdue: book.myLoanDueAt ? isOverdue({ dueAt: book.myLoanDueAt, returnedAt: null }, now) : false,
    myHoldId: book.myHoldId,
    myHoldStatus: book.myHoldStatus,
    myHoldReadyLabel: book.myHoldReadyUntil ? formatShortDate(book.myHoldReadyUntil) : null,
    myQueuePosition: book.myQueuePosition,
  };

  const byline = [book.authors.join(", "), book.year, book.pages ? `${book.pages} pages` : null]
    .filter(Boolean)
    .join(" · ");
  const demoMode = isDemoMode();
  const switcherUser = { id: user.id, name: user.name, role: user.role };
  const demoUsers = demoMode ? DEMO_USERS.map(({ id: demoId, name, role }) => ({ id: demoId, name, role })) : [];

  const stats = [
    { value: `${book.available} / ${book.totalCopies}`, label: "available" },
    { value: `${LOAN_DAYS} days`, label: "loan period" },
    { value: book.shelfLocation ?? "—", label: "shelf" },
  ];

  const facts = [
    ["Publisher", book.publisher],
    ["ISBN", book.isbn],
    ["Language", book.language],
    ["Borrowed", `${book.timesBorrowed} ${book.timesBorrowed === 1 ? "time" : "times"}`],
    ["Waiting", book.waitingHolds > 0 ? `${book.waitingHolds} in the queue` : "Nobody"],
  ].filter((fact): fact is [string, string] => Boolean(fact[1]));

  return (
    <div className="pb-40 md:pb-12">
      {/* Phone: cover on the page background, details on a white sheet */}
      <div className="relative px-4 pt-4 md:hidden">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="Back to catalog"
            className="grid size-12 place-items-center rounded-full border border-border bg-surface"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <RoleSwitcher user={switcherUser} demoMode={demoMode} demoUsers={demoUsers} variant="pill" />
        </div>
        <div className="flex justify-center py-8">
          <BookCover title={book.title} coverUrl={book.coverUrl} size="lg" priority className="w-[150px]" />
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] md:px-8 md:py-8">
        <Link
          href="/"
          className="mb-6 hidden items-center gap-1 rounded-lg text-[15px] font-semibold text-ink-2 hover:text-foreground md:inline-flex"
        >
          <ChevronLeft className="size-4" aria-hidden /> Catalog
        </Link>

        <article className="rounded-t-[28px] border-t border-border bg-surface px-5 pt-7 pb-8 md:grid md:grid-cols-[220px_1fr] md:gap-10 md:rounded-3xl md:border md:p-8 lg:grid-cols-[240px_1fr]">
          <div className="hidden md:block">
            <BookCover title={book.title} coverUrl={book.coverUrl} size="lg" priority className="w-full" />
          </div>

          <div className="min-w-0">
            <h1 className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em] md:text-[40px]">
              {book.title}
            </h1>
            <p className="mt-2 text-[17px] text-ink-2">{byline}</p>

            {book.genres.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Genres and tags">
                {book.genres.map((genre) => (
                  <li key={genre}>
                    <Link
                      href={`/?tag=${encodeURIComponent(genre)}`}
                      className="inline-flex h-9 items-center rounded-full bg-secondary px-3.5 text-[15px] font-semibold text-foreground hover:bg-border"
                    >
                      {genre}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {book.description && (
              <p className="mt-5 max-w-[65ch] text-[17px] leading-relaxed text-foreground/90">{book.description}</p>
            )}

            <dl className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-background p-4 md:max-w-lg">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">{stat.value}</dd>
                  <dd className="text-[15px] text-ink-2">{stat.label}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 hidden md:block">
              <BookActions state={actionState} layout="inline" />
            </div>

            <dl className="mt-8 grid max-w-lg grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[15px]">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-ink-3">{label}</dt>
                  <dd className="text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </article>

        {isStaff && (
          <div className="mt-6 grid gap-6 px-4 md:px-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <BookDeskPanel
              bookId={book.id}
              title={book.title}
              openLoans={book.openLoans}
              available={book.available}
              members={members}
            />
            <LoanHistoryTable loans={history} />
          </div>
        )}

        {similar.length > 0 && (
          <section className="mt-10 px-4 md:px-0" aria-labelledby="similar-heading">
            <h2 id="similar-heading" className="mb-4 text-[22px] font-extrabold tracking-[-0.02em]">
              More like this
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
              {similar.map((card) => (
                <li key={card.id} className="contents">
                  <BookCard book={card} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <BookActions state={actionState} layout="sticky" />
    </div>
  );
}
