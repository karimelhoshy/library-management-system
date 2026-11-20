import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { bookInputSchema, type BookInput } from "@/lib/validation";
import { bookEmbeddingText, embeddingHash, embedTexts } from "@/server/ai/embed";
import { assertCan, DomainError, type Actor } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { books, loans, type Book } from "@/server/db/schema";
import { isAiEnabled } from "@/server/env";
import { logActivity } from "./activity";
import { promoteHolds, type PromotedHold } from "./holds";
import { notifyHoldsReadySafely } from "./notifications";

export async function getBook(id: string): Promise<Book | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [book] = await db.select().from(books).where(eq(books.id, id));
  return book ?? null;
}

export async function findBookByIsbn(isbn: string): Promise<Book | null> {
  const [book] = await db.select().from(books).where(eq(books.isbn, isbn));
  return book ?? null;
}

export async function createBook(actor: Actor, input: BookInput): Promise<Book> {
  assertCan(actor, "book:write");
  const data = bookInputSchema.parse(input);
  if (data.isbn && (await findBookByIsbn(data.isbn))) {
    throw new DomainError("A book with this ISBN is already in the catalog. Add a copy instead.");
  }
  const book = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(books)
      .values({ ...data, createdBy: actor.id })
      .returning();
    if (!created) throw new Error("Failed to create book");
    await logActivity(tx, {
      actorId: actor.id,
      action: "book.created",
      entityType: "book",
      entityId: created.id,
      metadata: { title: created.title, bookId: created.id },
    });
    return created;
  });
  return book;
}

export async function updateBook(actor: Actor, id: string, input: BookInput): Promise<Book> {
  assertCan(actor, "book:write");
  const data = bookInputSchema.parse(input);
  if (data.isbn) {
    const other = await findBookByIsbn(data.isbn);
    if (other && other.id !== id) throw new DomainError("Another book already uses this ISBN.");
  }

  const { book, promoted } = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(books).where(eq(books.id, id)).for("update");
    if (!current) throw new DomainError("Book not found.", 404);

    const [onLoan] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(loans)
      .where(and(eq(loans.bookId, id), isNull(loans.returnedAt)));
    if (data.totalCopies < (onLoan?.n ?? 0)) {
      throw new DomainError(`${onLoan?.n} copies are on loan, so total copies can't go below that.`);
    }

    const [updated] = await tx.update(books).set(data).where(eq(books.id, id)).returning();
    if (!updated) throw new Error("Failed to update book");
    await logActivity(tx, {
      actorId: actor.id,
      action: "book.updated",
      entityType: "book",
      entityId: id,
      metadata: { title: updated.title, bookId: id },
    });
    // More copies may let waiting holds through.
    const promoted =
      updated.totalCopies > current.totalCopies ? await promoteHolds(tx, id) : ([] as PromotedHold[]);
    return { book: updated, promoted };
  });
  await notifyHoldsReadySafely(promoted);
  return book;
}

export async function addCopies(actor: Actor, id: string, count = 1): Promise<Book> {
  assertCan(actor, "book:write");
  const { book, promoted } = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(books)
      .set({ totalCopies: sql`${books.totalCopies} + ${count}` })
      .where(eq(books.id, id))
      .returning();
    if (!updated) throw new DomainError("Book not found.", 404);
    await logActivity(tx, {
      actorId: actor.id,
      action: "book.copies_added",
      entityType: "book",
      entityId: id,
      metadata: { title: updated.title, bookId: id, count },
    });
    return { book: updated, promoted: await promoteHolds(tx, id) };
  });
  await notifyHoldsReadySafely(promoted);
  return book;
}

/** Deleting is blocked while any copy is on loan. Loan history goes with the book. */
export async function deleteBook(actor: Actor, id: string): Promise<{ title: string }> {
  assertCan(actor, "book:write");
  return db.transaction(async (tx) => {
    const [book] = await tx.select().from(books).where(eq(books.id, id)).for("update");
    if (!book) throw new DomainError("Book not found.", 404);
    const [onLoan] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(loans)
      .where(and(eq(loans.bookId, id), isNull(loans.returnedAt)));
    if ((onLoan?.n ?? 0) > 0) {
      throw new DomainError(
        `This book can't be deleted while ${onLoan?.n === 1 ? "a copy is" : `${onLoan?.n} copies are`} on loan.`,
      );
    }
    await tx.delete(books).where(eq(books.id, id));
    await logActivity(tx, {
      actorId: actor.id,
      action: "book.deleted",
      entityType: "book",
      entityId: id,
      metadata: { title: book.title, isbn: book.isbn },
    });
    return { title: book.title };
  });
}

/**
 * (Re)embeds books whose text changed since their last embedding.
 * Safe to call without an AI key (does nothing). Returns how many were embedded.
 */
export async function refreshEmbeddings(ids?: string[]): Promise<number> {
  if (!isAiEnabled()) return 0;
  const rows = await db
    .select({
      id: books.id,
      title: books.title,
      authors: books.authors,
      genres: books.genres,
      summary: books.summary,
      description: books.description,
      embeddingHash: books.embeddingHash,
    })
    .from(books)
    .where(ids ? inArray(books.id, ids) : or(isNull(books.embedding), isNull(books.embeddingHash)));

  const stale = rows
    .map((row) => {
      const text = bookEmbeddingText(row);
      return { id: row.id, text, hash: embeddingHash(text), current: row.embeddingHash };
    })
    .filter((row) => row.hash !== row.current);

  let embedded = 0;
  for (let i = 0; i < stale.length; i += 50) {
    const batch = stale.slice(i, i + 50);
    const vectors = await embedTexts(
      batch.map((row) => row.text),
      "RETRIEVAL_DOCUMENT",
    );
    if (!vectors) break;
    for (const [index, row] of batch.entries()) {
      await db
        .update(books)
        .set({ embedding: vectors[index], embeddingHash: row.hash, updatedAt: sql`${books.updatedAt}` })
        .where(eq(books.id, row.id));
      embedded++;
    }
  }
  return embedded;
}

/** Fire-and-forget wrapper used after saves: embedding must never block or fail a save. */
export async function refreshEmbeddingsSafely(ids: string[]): Promise<void> {
  try {
    await refreshEmbeddings(ids);
  } catch (error) {
    console.error("[embeddings] refresh failed", error);
  }
}
