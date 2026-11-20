import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { assertCan, can, DomainError, ForbiddenError, type Actor } from "@/server/auth/permissions";
import { db, type Transaction } from "@/server/db";
import { books, holds, loans, users } from "@/server/db/schema";
import { logActivity } from "./activity";
import { notifyHoldsReadySafely } from "./notifications";
import { availableCopies, holdReadyUntil, holdsToPromote } from "./rules";

/** Locks the book row so concurrent borrows, returns and holds on one title run one at a time. */
export async function lockBook(tx: Transaction, bookId: string) {
  const [book] = await tx
    .select({ id: books.id, title: books.title, totalCopies: books.totalCopies })
    .from(books)
    .where(eq(books.id, bookId))
    .for("update");
  if (!book) throw new DomainError("That book no longer exists.", 404);
  return book;
}

/** Current copy counts for a (locked) book. */
export async function countCopies(tx: Transaction, bookId: string, totalCopies: number) {
  const [openLoans] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(loans)
    .where(and(eq(loans.bookId, bookId), sql`${loans.returnedAt} is null`));
  const [readyHolds] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(holds)
    .where(and(eq(holds.bookId, bookId), eq(holds.status, "ready")));
  return { totalCopies, openLoans: openLoans?.n ?? 0, readyHolds: readyHolds?.n ?? 0 };
}

export type PromotedHold = {
  holdId: string;
  bookId: string;
  bookTitle: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  readyUntil: Date;
};

/**
 * Gives free copies to the oldest waiting holds. Call inside the transaction that freed
 * the copy (return, cancelled ready hold, expiry, more copies added). The caller sends
 * the "your hold is ready" notifications after commit.
 */
export async function promoteHolds(tx: Transaction, bookId: string): Promise<PromotedHold[]> {
  const book = await lockBook(tx, bookId);
  const counts = await countCopies(tx, bookId, book.totalCopies);
  if (availableCopies(counts) === 0) return [];

  const waiting = await tx
    .select({ id: holds.id, createdAt: holds.createdAt })
    .from(holds)
    .where(and(eq(holds.bookId, bookId), eq(holds.status, "waiting")))
    .orderBy(asc(holds.createdAt));
  const ids = holdsToPromote(counts, waiting);
  if (ids.length === 0) return [];

  const readyUntil = holdReadyUntil(new Date());
  await tx.update(holds).set({ status: "ready", readyUntil }).where(inArray(holds.id, ids));

  const promoted = await tx
    .select({
      holdId: holds.id,
      userId: holds.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(holds)
    .innerJoin(users, eq(users.id, holds.userId))
    .where(inArray(holds.id, ids));

  for (const hold of promoted) {
    await logActivity(tx, {
      actorId: null,
      action: "hold.ready",
      entityType: "hold",
      entityId: hold.holdId,
      metadata: { title: book.title, bookId, memberName: hold.userName },
    });
  }

  return promoted.map((hold) => ({ ...hold, bookId, bookTitle: book.title, readyUntil }));
}

export type PlaceHoldResult = { holdId: string; title: string; position: number };

export async function placeHold(actor: Actor, bookId: string): Promise<PlaceHoldResult> {
  assertCan(actor, "hold:self");
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, bookId);

    const [openLoan] = await tx
      .select({ id: loans.id })
      .from(loans)
      .where(and(eq(loans.bookId, bookId), eq(loans.userId, actor.id), sql`${loans.returnedAt} is null`));
    if (openLoan) throw new DomainError("You already have this book on loan.");

    const [existing] = await tx
      .select({ id: holds.id, status: holds.status })
      .from(holds)
      .where(
        and(eq(holds.bookId, bookId), eq(holds.userId, actor.id), inArray(holds.status, ["waiting", "ready"])),
      );
    if (existing) {
      throw new DomainError(
        existing.status === "ready"
          ? "A copy is already waiting for you. Borrow it from the book page."
          : "You're already in the queue for this book.",
      );
    }

    const counts = await countCopies(tx, bookId, book.totalCopies);
    if (availableCopies(counts) > 0) {
      throw new DomainError("A copy is available right now, so you can borrow it instead.");
    }

    const [hold] = await tx
      .insert(holds)
      .values({ bookId, userId: actor.id, status: "waiting" })
      .returning({ id: holds.id });
    if (!hold) throw new Error("Failed to create hold");

    const [ahead] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(holds)
      .where(and(eq(holds.bookId, bookId), eq(holds.status, "waiting")));

    await logActivity(tx, {
      actorId: actor.id,
      action: "hold.placed",
      entityType: "hold",
      entityId: hold.id,
      metadata: { title: book.title, bookId },
    });

    return { holdId: hold.id, title: book.title, position: ahead?.n ?? 1 };
  });
}

export async function cancelHold(
  actor: Actor,
  holdId: string,
): Promise<{ title: string; promoted: PromotedHold[] }> {
  const [hold] = await db.select().from(holds).where(eq(holds.id, holdId));
  if (!hold) throw new DomainError("Hold not found.", 404);
  if (hold.userId === actor.id) assertCan(actor, "hold:self");
  else if (!can(actor, "loan:any")) throw new ForbiddenError();

  const result = await db.transaction(async (tx) => {
    const book = await lockBook(tx, hold.bookId);
    const [updated] = await tx
      .update(holds)
      .set({ status: "cancelled", readyUntil: null })
      .where(and(eq(holds.id, holdId), inArray(holds.status, ["waiting", "ready"])))
      .returning({ id: holds.id });
    if (!updated) throw new DomainError("This hold is no longer active.");

    await logActivity(tx, {
      actorId: actor.id,
      action: "hold.cancelled",
      entityType: "hold",
      entityId: holdId,
      metadata: { title: book.title, bookId: hold.bookId },
    });

    // Cancelling a ready hold frees its copy for the next person in line.
    const promoted = hold.status === "ready" ? await promoteHolds(tx, hold.bookId) : [];
    return { title: book.title, promoted };
  });
  await notifyHoldsReadySafely(result.promoted);
  return result;
}

/** Marks a ready hold as fulfilled when its member borrows the book (inside the borrow tx). */
export async function fulfillReadyHold(tx: Transaction, bookId: string, userId: string): Promise<boolean> {
  const updated = await tx
    .update(holds)
    .set({ status: "fulfilled" })
    .where(and(eq(holds.bookId, bookId), eq(holds.userId, userId), eq(holds.status, "ready")))
    .returning({ id: holds.id });
  return updated.length > 0;
}

/** Daily job: ready holds past their pickup window expire, and the copy passes on. */
export async function expireStaleHolds(now = new Date()): Promise<{
  expired: number;
  promoted: PromotedHold[];
}> {
  const stale = await db
    .select({ id: holds.id, bookId: holds.bookId, title: books.title })
    .from(holds)
    .innerJoin(books, eq(books.id, holds.bookId))
    .where(and(eq(holds.status, "ready"), lt(holds.readyUntil, now)));

  const promoted: PromotedHold[] = [];
  for (const hold of stale) {
    const result = await db.transaction(async (tx) => {
      await lockBook(tx, hold.bookId);
      const [expired] = await tx
        .update(holds)
        .set({ status: "expired" })
        .where(and(eq(holds.id, hold.id), eq(holds.status, "ready")))
        .returning({ id: holds.id });
      if (!expired) return [];
      await logActivity(tx, {
        actorId: null,
        action: "hold.expired",
        entityType: "hold",
        entityId: hold.id,
        metadata: { title: hold.title, bookId: hold.bookId },
      });
      return promoteHolds(tx, hold.bookId);
    });
    promoted.push(...result);
  }
  await notifyHoldsReadySafely(promoted);
  return { expired: stale.length, promoted };
}

export type MyHold = {
  id: string;
  bookId: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  isbn: string | null;
  status: "waiting" | "ready";
  createdAt: Date;
  readyUntil: Date | null;
  position: number | null;
};

export async function listMyHolds(userId: string): Promise<MyHold[]> {
  const rows = await db
    .select({
      id: holds.id,
      bookId: holds.bookId,
      title: books.title,
      authors: books.authors,
      coverUrl: books.coverUrl,
      isbn: books.isbn,
      status: holds.status,
      createdAt: holds.createdAt,
      readyUntil: holds.readyUntil,
      position: sql<number | null>`case when "holds"."status" = 'waiting' then (
        select count(*)::int from holds h2
        where h2.book_id = "holds"."book_id" and h2.status = 'waiting' and h2.created_at <= "holds"."created_at"
      ) end`,
    })
    .from(holds)
    .innerJoin(books, eq(books.id, holds.bookId))
    .where(and(eq(holds.userId, userId), inArray(holds.status, ["waiting", "ready"])))
    .orderBy(sql`case when ${holds.status} = 'ready' then 0 else 1 end`, asc(holds.createdAt));
  return rows.map((row) => ({ ...row, status: row.status as MyHold["status"] }));
}

export async function countReadyHolds(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(holds)
    .where(and(eq(holds.userId, userId), eq(holds.status, "ready")));
  return row?.n ?? 0;
}
