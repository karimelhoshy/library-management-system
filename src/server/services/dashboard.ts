import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { assertCan, type Actor } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { books, holds, loans } from "@/server/db/schema";

export type DashboardStats = {
  titles: number;
  copies: number;
  onLoan: number;
  overdue: number;
  holdsReady: number;
  holdsWaiting: number;
};

export async function getDashboardStats(actor: Actor): Promise<DashboardStats> {
  assertCan(actor, "desk:read");
  const [catalog] = await db
    .select({
      titles: sql<number>`count(*)::int`,
      copies: sql<number>`coalesce(sum(${books.totalCopies}), 0)::int`,
    })
    .from(books);
  const [loanStats] = await db
    .select({
      onLoan: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${loans.dueAt} < now())::int`,
    })
    .from(loans)
    .where(isNull(loans.returnedAt));
  const [holdStats] = await db
    .select({
      ready: sql<number>`count(*) filter (where ${holds.status} = 'ready')::int`,
      waiting: sql<number>`count(*) filter (where ${holds.status} = 'waiting')::int`,
    })
    .from(holds);
  return {
    titles: catalog?.titles ?? 0,
    copies: catalog?.copies ?? 0,
    onLoan: loanStats?.onLoan ?? 0,
    overdue: loanStats?.overdue ?? 0,
    holdsReady: holdStats?.ready ?? 0,
    holdsWaiting: holdStats?.waiting ?? 0,
  };
}

/** Loans started per day for the last `days` days, including zero days. */
export async function getLoansPerDay(actor: Actor, days = 30): Promise<{ date: string; loans: number; returns: number }[]> {
  assertCan(actor, "desk:read");
  const result = await db.execute<{ date: string; loans: number; returns: number }>(sql`
    with days as (
      select generate_series(
        (now() at time zone 'utc')::date - ${days - 1}::int,
        (now() at time zone 'utc')::date,
        interval '1 day'
      )::date as day
    )
    select
      to_char(days.day, 'YYYY-MM-DD') as date,
      (select count(*)::int from ${loans} where (${loans.borrowedAt} at time zone 'utc')::date = days.day) as loans,
      (select count(*)::int from ${loans} where (${loans.returnedAt} at time zone 'utc')::date = days.day) as returns
    from days
    order by days.day
  `);
  return result.rows;
}

export async function getTopBorrowed(actor: Actor, limit = 5) {
  assertCan(actor, "desk:read");
  return db
    .select({
      id: books.id,
      title: books.title,
      authors: books.authors,
      coverUrl: books.coverUrl,
      isbn: books.isbn,
      count: sql<number>`count(${loans.id})::int`,
    })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .where(sql`${loans.borrowedAt} > now() - interval '60 days'`)
    .groupBy(books.id)
    .orderBy(desc(sql`count(${loans.id})`), books.title)
    .limit(limit);
}

export async function countOverdueLoans(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loans)
    .where(and(isNull(loans.returnedAt), lt(loans.dueAt, new Date())));
  return row?.n ?? 0;
}
