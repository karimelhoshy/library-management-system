import { and, asc, desc, eq, ilike, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { UNDO_WINDOW_SECONDS } from "@/lib/config";
import { assertCan, can, DomainError, ForbiddenError, type Actor } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { books, holds, loans, users } from "@/server/db/schema";
import { logActivity } from "./activity";
import { countCopies, fulfillReadyHold, lockBook, promoteHolds, type PromotedHold } from "./holds";
import { notifyHoldsReadySafely } from "./notifications";
import { availableCopies, checkRenewal, dueDateFrom } from "./rules";

/** Acting for yourself needs `loan:self`; acting for someone else needs `loan:any`. */
function assertLoanAccess(actor: Actor, memberId: string) {
  if (memberId === actor.id) assertCan(actor, "loan:self");
  else if (!can(actor, "loan:any")) throw new ForbiddenError();
}

async function memberName(memberId: string): Promise<string | null> {
  const [member] = await db.select({ name: users.name }).from(users).where(eq(users.id, memberId));
  if (!member) throw new DomainError("Member not found.", 404);
  return member.name;
}

export type BorrowResult = { loanId: string; bookId: string; title: string; dueAt: Date };

/**
 * Borrow a copy. Runs in a transaction that locks the book row, so two people
 * can't both take the last copy.
 */
export async function borrowBook(
  actor: Actor,
  input: { bookId: string; memberId?: string },
): Promise<BorrowResult> {
  const memberId = input.memberId ?? actor.id;
  assertLoanAccess(actor, memberId);
  const name = await memberName(memberId);

  return db.transaction(async (tx) => {
    const book = await lockBook(tx, input.bookId);

    const [existing] = await tx
      .select({ id: loans.id })
      .from(loans)
      .where(and(eq(loans.bookId, book.id), eq(loans.userId, memberId), isNull(loans.returnedAt)));
    if (existing) {
      throw new DomainError(
        memberId === actor.id ? "You already have this book on loan." : `${name} already has this book.`,
      );
    }

    // A ready hold is this member's reserved copy; otherwise there must be a free one.
    const hadReadyHold = await fulfillReadyHold(tx, book.id, memberId);
    if (!hadReadyHold) {
      const counts = await countCopies(tx, book.id, book.totalCopies);
      if (availableCopies(counts) === 0) {
        throw new DomainError("No copies are free right now. Place a hold to join the queue.");
      }
    }

    const borrowedAt = new Date();
    const [loan] = await tx
      .insert(loans)
      .values({
        bookId: book.id,
        userId: memberId,
        borrowedAt,
        dueAt: dueDateFrom(borrowedAt),
        processedBy: actor.id,
      })
      .returning({ id: loans.id, dueAt: loans.dueAt });
    if (!loan) throw new Error("Failed to create loan");

    await logActivity(tx, {
      actorId: actor.id,
      action: "loan.borrowed",
      entityType: "loan",
      entityId: loan.id,
      metadata: { title: book.title, bookId: book.id, memberName: name, fromHold: hadReadyHold },
    });

    return { loanId: loan.id, bookId: book.id, title: book.title, dueAt: loan.dueAt };
  });
}

export type ReturnResult = { loanId: string; bookId: string; title: string; promoted: PromotedHold[] };

export async function returnLoan(actor: Actor, loanId: string): Promise<ReturnResult> {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
  if (!loan) throw new DomainError("Loan not found.", 404);
  assertLoanAccess(actor, loan.userId);
  const name = await memberName(loan.userId);

  const result = await db.transaction(async (tx) => {
    const book = await lockBook(tx, loan.bookId);
    const [closed] = await tx
      .update(loans)
      .set({ returnedAt: new Date(), processedBy: actor.id })
      .where(and(eq(loans.id, loanId), isNull(loans.returnedAt)))
      .returning({ id: loans.id });
    if (!closed) throw new DomainError("This book has already been returned.");

    await logActivity(tx, {
      actorId: actor.id,
      action: "loan.returned",
      entityType: "loan",
      entityId: loanId,
      metadata: { title: book.title, bookId: book.id, memberName: name },
    });

    // The freed copy goes to the first person waiting, if anyone is.
    const promoted = await promoteHolds(tx, book.id);
    return { loanId, bookId: book.id, title: book.title, promoted };
  });

  await notifyHoldsReadySafely(result.promoted);
  return result;
}

export async function renewLoan(
  actor: Actor,
  loanId: string,
): Promise<{ loanId: string; title: string; dueAt: Date }> {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
  if (!loan) throw new DomainError("Loan not found.", 404);
  assertLoanAccess(actor, loan.userId);
  const name = await memberName(loan.userId);

  return db.transaction(async (tx) => {
    const book = await lockBook(tx, loan.bookId);
    const [current] = await tx.select().from(loans).where(eq(loans.id, loanId)).for("update");
    if (!current) throw new DomainError("Loan not found.", 404);

    const [waiting] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(holds)
      .where(and(eq(holds.bookId, loan.bookId), eq(holds.status, "waiting")));

    const check = checkRenewal(current, waiting?.n ?? 0);
    if (!check.ok) throw new DomainError(check.reason);

    await tx
      .update(loans)
      .set({ dueAt: check.newDueAt, renewCount: current.renewCount + 1 })
      .where(eq(loans.id, loanId));

    await logActivity(tx, {
      actorId: actor.id,
      action: "loan.renewed",
      entityType: "loan",
      entityId: loanId,
      metadata: { title: book.title, bookId: book.id, memberName: name, dueAt: check.newDueAt.toISOString() },
    });

    return { loanId, title: book.title, dueAt: check.newDueAt };
  });
}

function withinUndoWindow(at: Date) {
  return Date.now() - at.getTime() <= UNDO_WINDOW_SECONDS * 1000;
}

/** Undo from the toast: removes a loan made moments ago. */
export async function undoBorrow(actor: Actor, loanId: string): Promise<void> {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
  if (!loan) throw new DomainError("Loan not found.", 404);
  assertLoanAccess(actor, loan.userId);
  if (loan.returnedAt || !withinUndoWindow(loan.borrowedAt)) {
    throw new DomainError("This loan can no longer be undone. Return it instead.");
  }

  const promoted = await db.transaction(async (tx) => {
    const book = await lockBook(tx, loan.bookId);
    await tx.delete(loans).where(eq(loans.id, loanId));
    await logActivity(tx, {
      actorId: actor.id,
      action: "loan.undone",
      entityType: "loan",
      entityId: loanId,
      metadata: { title: book.title, bookId: book.id },
    });
    return promoteHolds(tx, book.id);
  });
  await notifyHoldsReadySafely(promoted);
}

/** Undo from the toast: reopens a loan returned moments ago, if the copy is still free. */
export async function undoReturn(actor: Actor, loanId: string): Promise<void> {
  const [loan] = await db.select().from(loans).where(eq(loans.id, loanId));
  if (!loan) throw new DomainError("Loan not found.", 404);
  assertLoanAccess(actor, loan.userId);
  if (!loan.returnedAt || !withinUndoWindow(loan.returnedAt)) {
    throw new DomainError("This return can no longer be undone.");
  }

  await db.transaction(async (tx) => {
    const book = await lockBook(tx, loan.bookId);
    const counts = await countCopies(tx, book.id, book.totalCopies);
    if (availableCopies(counts) === 0) {
      throw new DomainError("That copy has already gone to the next person waiting.");
    }
    await tx.update(loans).set({ returnedAt: null }).where(eq(loans.id, loanId));
    await logActivity(tx, {
      actorId: actor.id,
      action: "loan.return_undone",
      entityType: "loan",
      entityId: loanId,
      metadata: { title: book.title, bookId: book.id },
    });
  });
}

/* ---------- Queries ---------- */

export type LoanRow = {
  id: string;
  bookId: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  isbn: string | null;
  userId: string;
  memberName: string | null;
  memberEmail: string | null;
  borrowedAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
  renewCount: number;
  waitingHolds: number;
};

const member = alias(users, "member");

function loanSelect() {
  return db
    .select({
      id: loans.id,
      bookId: loans.bookId,
      title: books.title,
      authors: books.authors,
      coverUrl: books.coverUrl,
      isbn: books.isbn,
      userId: loans.userId,
      memberName: member.name,
      memberEmail: member.email,
      borrowedAt: loans.borrowedAt,
      dueAt: loans.dueAt,
      returnedAt: loans.returnedAt,
      renewCount: loans.renewCount,
      waitingHolds: sql<number>`(select count(*)::int from holds h where h.book_id = "loans"."book_id" and h.status = 'waiting')`,
    })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .innerJoin(member, eq(member.id, loans.userId))
    .$dynamic();
}

export async function listMyLoans(userId: string): Promise<LoanRow[]> {
  return loanSelect()
    .where(and(eq(loans.userId, userId), isNull(loans.returnedAt)))
    .orderBy(asc(loans.dueAt));
}

export async function listMyLoanHistory(userId: string, limit = 20): Promise<LoanRow[]> {
  return loanSelect()
    .where(and(eq(loans.userId, userId), sql`${loans.returnedAt} is not null`))
    .orderBy(desc(loans.returnedAt))
    .limit(limit);
}

export async function countOverdue(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loans)
    .where(and(eq(loans.userId, userId), isNull(loans.returnedAt), lt(loans.dueAt, new Date())));
  return row?.n ?? 0;
}

/** Loans desk: every open loan, optionally overdue only or filtered by member/title. */
export async function listActiveLoans(
  actor: Actor,
  filter: { overdueOnly?: boolean; q?: string } = {},
): Promise<LoanRow[]> {
  assertCan(actor, "loan:any");
  const conditions: SQL[] = [isNull(loans.returnedAt)];
  if (filter.overdueOnly) conditions.push(lt(loans.dueAt, new Date()));
  if (filter.q?.trim()) {
    const like = `%${filter.q.trim()}%`;
    conditions.push(or(ilike(books.title, like), ilike(member.name, like), ilike(member.email, like))!);
  }
  return loanSelect()
    .where(and(...conditions))
    .orderBy(asc(loans.dueAt));
}

export async function listBookLoanHistory(actor: Actor, bookId: string, limit = 15): Promise<LoanRow[]> {
  assertCan(actor, "loan:any");
  return loanSelect().where(eq(loans.bookId, bookId)).orderBy(desc(loans.borrowedAt)).limit(limit);
}
