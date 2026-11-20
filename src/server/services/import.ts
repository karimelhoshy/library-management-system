import { sql } from "drizzle-orm";
import { searchOpenLibrary, type BookDraft } from "@/lib/open-library";
import type { DetectedBook } from "@/server/ai/vision";
import { assertCan, type Actor } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { books } from "@/server/db/schema";
import { logActivity } from "./activity";
import { addCopies, createBook, findBookByIsbn, refreshEmbeddingsSafely } from "./books";

export type ImportMatch =
  | { kind: "owned"; bookId: string; title: string; authors: string[]; coverUrl: string | null; totalCopies: number }
  | { kind: "new"; draft: BookDraft }
  | { kind: "unmatched" };

export type ImportCandidate = {
  key: string;
  detected: DetectedBook;
  match: ImportMatch;
};

/** Best fuzzy title match already in the catalog, if it's close enough. */
async function findOwned(title: string, author: string | null) {
  const result = await db.execute<{
    id: string;
    title: string;
    authors: string[];
    cover_url: string | null;
    total_copies: number;
    score: number;
  }>(sql`
    select id, title, authors, cover_url, total_copies,
      similarity(lower(${books.title}), lower(${title}))
        + case when ${author ?? ""} <> '' then 0.2 * word_similarity(${author ?? ""}, shelfwise_join(${books.authors})) else 0 end
        as score
    from ${books}
    where lower(${books.title}) % lower(${title}) or ${books.title} ilike ${title}
    order by score desc
    limit 1
  `);
  const row = result.rows[0];
  return row && row.score >= 0.55 ? row : null;
}

async function matchOne(detected: DetectedBook): Promise<ImportMatch> {
  const owned = await findOwned(detected.title, detected.author);
  if (owned) {
    return {
      kind: "owned",
      bookId: owned.id,
      title: owned.title,
      authors: owned.authors,
      coverUrl: owned.cover_url,
      totalCopies: owned.total_copies,
    };
  }
  const draft = await searchOpenLibrary(detected.title, detected.author ?? undefined);
  if (!draft) return { kind: "unmatched" };
  if (draft.isbn) {
    const byIsbn = await findBookByIsbn(draft.isbn);
    if (byIsbn) {
      return {
        kind: "owned",
        bookId: byIsbn.id,
        title: byIsbn.title,
        authors: byIsbn.authors,
        coverUrl: byIsbn.coverUrl,
        totalCopies: byIsbn.totalCopies,
      };
    }
  }
  return { kind: "new", draft };
}

/** Matches each detected title against the catalog, then Open Library (4 at a time). */
export async function matchDetectedBooks(actor: Actor, detected: DetectedBook[]): Promise<ImportCandidate[]> {
  assertCan(actor, "book:write");
  const results: ImportCandidate[] = [];
  for (let i = 0; i < detected.length; i += 4) {
    const batch = detected.slice(i, i + 4);
    const matches = await Promise.all(batch.map(matchOne));
    batch.forEach((item, index) =>
      results.push({ key: `${i + index}-${item.title}`, detected: item, match: matches[index]! }),
    );
  }
  return results;
}

export type ImportItem =
  | { kind: "copy"; bookId: string }
  | { kind: "new"; draft: BookDraft };

/** Imports the reviewed rows: new books are created, owned ones get another copy. */
export async function importBooks(actor: Actor, items: ImportItem[]): Promise<{ created: number; copies: number }> {
  assertCan(actor, "book:write");
  let created = 0;
  let copies = 0;
  const newIds: string[] = [];
  for (const item of items.slice(0, 40)) {
    if (item.kind === "copy") {
      await addCopies(actor, item.bookId, 1);
      copies++;
      continue;
    }
    const { draft } = item;
    // An ISBN we already have (e.g. two rows for the same book) becomes a copy.
    const existing = draft.isbn ? await findBookByIsbn(draft.isbn) : null;
    if (existing) {
      await addCopies(actor, existing.id, 1);
      copies++;
      continue;
    }
    const book = await createBook(actor, {
      title: draft.title,
      authors: draft.authors.length ? draft.authors : ["Unknown"],
      isbn: draft.isbn,
      coverUrl: draft.coverUrl,
      description: draft.description,
      genres: draft.genres,
      publisher: draft.publisher,
      year: draft.year,
      pages: draft.pages,
      language: draft.language,
      totalCopies: 1,
    });
    newIds.push(book.id);
    created++;
  }
  await logActivity(db, {
    actorId: actor.id,
    action: "import.completed",
    entityType: "import",
    metadata: { count: created + copies, created, copies },
  });
  if (newIds.length) await refreshEmbeddingsSafely(newIds);
  return { created, copies };
}
