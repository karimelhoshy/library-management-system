"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { toIsbn13 } from "@/lib/isbn";
import { lookupIsbn, type BookDraft } from "@/lib/open-library";
import type { BookInput } from "@/lib/validation";
import { assertCan, DomainError } from "@/server/auth/permissions";
import {
  addCopies,
  createBook,
  deleteBook,
  findBookByIsbn,
  refreshEmbeddingsSafely,
  updateBook,
} from "@/server/services/books";
import { withUser, type ActionResult } from "./result";

export async function createBookAction(input: BookInput): Promise<ActionResult<{ id: string; title: string }>> {
  const result = await withUser(async (user) => {
    const book = await createBook(user, input);
    after(() => refreshEmbeddingsSafely([book.id]));
    return { id: book.id, title: book.title };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function updateBookAction(
  id: string,
  input: BookInput,
): Promise<ActionResult<{ id: string; title: string }>> {
  const result = await withUser(async (user) => {
    const book = await updateBook(user, id, input);
    after(() => refreshEmbeddingsSafely([book.id]));
    return { id: book.id, title: book.title };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function deleteBookAction(id: string): Promise<ActionResult<{ title: string }>> {
  const result = await withUser((user) => deleteBook(user, id));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function addCopiesAction(
  id: string,
  count = 1,
): Promise<ActionResult<{ id: string; title: string; totalCopies: number }>> {
  const result = await withUser(async (user) => {
    const book = await addCopies(user, id, Math.max(1, Math.min(50, Math.floor(count))));
    return { id: book.id, title: book.title, totalCopies: book.totalCopies };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export type IsbnLookup =
  | { status: "found"; draft: BookDraft }
  | { status: "owned"; bookId: string; title: string; totalCopies: number }
  | { status: "not_found"; isbn: string };

/** Fills the add-book form from Open Library, or says we already own it. */
export async function lookupIsbnAction(raw: string): Promise<ActionResult<IsbnLookup>> {
  return withUser(async (user) => {
    assertCan(user, "book:write");
    const isbn = toIsbn13(raw);
    if (!isbn) throw new DomainError("That isn't a valid ISBN.", 422);
    const owned = await findBookByIsbn(isbn);
    if (owned) {
      return { status: "owned", bookId: owned.id, title: owned.title, totalCopies: owned.totalCopies } as const;
    }
    const draft = await lookupIsbn(isbn);
    return draft ? ({ status: "found", draft } as const) : ({ status: "not_found", isbn } as const);
  });
}
