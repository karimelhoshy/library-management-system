import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import { looksLikeIsbn, toIsbn13 } from "@/lib/isbn";
import type { CatalogQuery } from "@/lib/validation";
import { embedQuery, toVectorLiteral } from "@/server/ai/embed";
import { consumeAiQuota } from "@/server/ai/rate-limit";
import { DomainError } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { books, holds, loans, type HoldStatus } from "@/server/db/schema";
import { isAiEnabled } from "@/server/env";

/** What a catalog card needs. Availability is computed in SQL, never stored. */
export type BookCard = {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  isbn: string | null;
  coverUrl: string | null;
  summary: string | null;
  genres: string[];
  pages: number | null;
  language: string;
  totalCopies: number;
  available: number;
  nextDueAt: Date | null;
  myLoanDueAt: Date | null;
  myHoldStatus: Extract<HoldStatus, "waiting" | "ready"> | null;
};

/* ---------- SQL building blocks ---------- */

// Correlated subqueries use explicit aliases and a fully qualified outer reference.
// (Drizzle omits table names in single-table selects, which would make "id" ambiguous.)
const BOOK_ID = sql.raw(`"books"."id"`);

export const openLoansSql = sql<number>`(select count(*)::int from loans l where l.book_id = ${BOOK_ID} and l.returned_at is null)`;
export const readyHoldsSql = sql<number>`(select count(*)::int from holds h where h.book_id = ${BOOK_ID} and h.status = 'ready')`;
export const availableSql = sql<number>`greatest(0, ${books.totalCopies} - ${openLoansSql} - ${readyHoldsSql})::int`;
const nextDueSql = sql<Date | null>`(select min(l.due_at) from loans l where l.book_id = ${BOOK_ID} and l.returned_at is null)`;
const timesBorrowedSql = sql<number>`(select count(*)::int from loans l where l.book_id = ${BOOK_ID})`;
const waitingHoldsSql = sql<number>`(select count(*)::int from holds h where h.book_id = ${BOOK_ID} and h.status = 'waiting')`;
const authorsText = sql`shelfwise_join(${books.authors})`;
const genresText = sql`shelfwise_join(${books.genres})`;

function myLoanSql(viewerId: string) {
  return sql<Date | null>`(select l.due_at from loans l where l.book_id = ${BOOK_ID} and l.user_id = ${viewerId} and l.returned_at is null limit 1)`;
}

function myHoldSql(viewerId: string) {
  return sql<string | null>`(select h.status::text from holds h where h.book_id = ${BOOK_ID} and h.user_id = ${viewerId} and h.status in ('waiting', 'ready') limit 1)`;
}

function cardColumns(viewerId: string) {
  return {
    id: books.id,
    title: books.title,
    authors: books.authors,
    year: books.year,
    isbn: books.isbn,
    coverUrl: books.coverUrl,
    summary: books.summary,
    genres: books.genres,
    pages: books.pages,
    language: books.language,
    totalCopies: books.totalCopies,
    available: availableSql,
    nextDueAt: nextDueSql,
    myLoanDueAt: myLoanSql(viewerId),
    myHoldStatus: myHoldSql(viewerId),
  };
}

type CardRow = Omit<BookCard, "nextDueAt" | "myLoanDueAt" | "myHoldStatus"> & {
  nextDueAt: Date | string | null;
  myLoanDueAt: Date | string | null;
  myHoldStatus: string | null;
};

/** Raw subquery timestamps come back as strings; normalise them. */
function toCard(row: CardRow): BookCard {
  const date = (value: Date | string | null) => (value ? new Date(value) : null);
  return {
    ...row,
    nextDueAt: date(row.nextDueAt),
    myLoanDueAt: date(row.myLoanDueAt),
    myHoldStatus: (row.myHoldStatus as BookCard["myHoldStatus"]) ?? null,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Matches one search term against title, authors, tags (fuzzy via pg_trgm) and ISBN. */
function termMatches(term: string): SQL {
  const like = `%${escapeLike(term)}%`;
  return sql`(
    ${books.title} ilike ${like}
    or ${authorsText} ilike ${like}
    or ${genresText} ilike ${like}
    or ${term} <% ${books.title}
    or ${term} <% ${authorsText}
  )`;
}

function filterConditions(query: CatalogQuery): SQL[] {
  const conditions: SQL[] = [];
  if (query.genre) conditions.push(sql`${books.genres} @> array[${query.genre}]::text[]`);
  if (query.tag) conditions.push(sql`${books.genres} @> array[${query.tag}]::text[]`);
  if (query.lang) conditions.push(eq(books.language, query.lang));
  if (query.yearFrom) conditions.push(gte(books.year, query.yearFrom));
  if (query.yearTo) conditions.push(lte(books.year, query.yearTo));
  if (query.maxPages) conditions.push(lte(books.pages, query.maxPages));
  if (query.minPages) conditions.push(gte(books.pages, query.minPages));
  if (query.recent) conditions.push(sql`${books.createdAt} > now() - interval '30 days'`);
  if (query.available) conditions.push(sql`${availableSql} > 0`);
  return conditions;
}

export type CatalogResult = {
  items: BookCard[];
  total: number;
  mode: "keyword" | "vibe";
  /** Set when vibe search was requested but couldn't run (no AI key, API error). */
  notice?: string;
};

const PAGE_SIZE = 60;

/** Keyword search: one box over title, author, ISBN and tags, typo-tolerant via pg_trgm. */
export async function searchCatalog(
  query: CatalogQuery,
  viewerId: string,
  limit = PAGE_SIZE,
): Promise<CatalogResult> {
  const q = query.q.trim();
  const conditions = filterConditions(query);
  let score: SQL = sql`0`;

  if (q) {
    const isbn = looksLikeIsbn(q) ? toIsbn13(q) : null;
    if (isbn) {
      conditions.push(eq(books.isbn, isbn));
    } else {
      // Every word must match somewhere ("japan mystery"), or the whole phrase must match fuzzily.
      const terms = q.split(/\s+/).filter((term) => term.length >= 2).slice(0, 6);
      const allTerms = terms.length ? and(...terms.map(termMatches)) : undefined;
      conditions.push(sql`(${termMatches(q)}${allTerms ? sql` or (${allTerms})` : sql``})`);
      score = sql`greatest(
        word_similarity(${q}, ${books.title}),
        word_similarity(${q}, ${authorsText}) * 0.95,
        case when ${books.title} ilike ${`${escapeLike(q)}%`} then 1.2 else 0 end,
        case when ${genresText} ilike ${`%${escapeLike(q)}%`} then 0.5 else 0 end
      )`;
    }
  }

  const orderBy: SQL[] = (() => {
    switch (query.sort) {
      case "title":
        return [asc(books.title)];
      case "newest":
        return [sql`${books.year} desc nulls last`, asc(books.title)];
      case "popular":
        return [sql`${timesBorrowedSql} desc`, asc(books.title)];
      default:
        return q
          ? [sql`${score} desc`, asc(books.title)]
          : [sql`${timesBorrowedSql} desc`, asc(books.title)];
    }
  })();

  const rows = await db
    .select({ ...cardColumns(viewerId), total: sql<number>`count(*) over()::int` })
    .from(books)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(limit);

  return {
    items: rows.map(({ total: _total, ...row }) => toCard(row)),
    total: rows[0]?.total ?? 0,
    mode: "keyword",
  };
}

/** "Search by vibe": embeds the query and ranks books by cosine similarity (pgvector). */
export async function vibeSearch(
  query: CatalogQuery,
  viewerId: string,
  limit = 12,
): Promise<CatalogResult> {
  const q = query.q.trim();
  if (!q) return searchCatalog(query, viewerId);

  const keywordsInstead = async (notice: string): Promise<CatalogResult> => ({
    ...(await searchCatalog(query, viewerId)),
    notice,
  });
  if (!isAiEnabled()) return keywordsInstead("Vibe search needs an AI key. Showing keyword matches instead.");

  let vector: number[] | null;
  try {
    await consumeAiQuota(viewerId, "vibe");
    vector = await embedQuery(q);
  } catch (error) {
    if (error instanceof DomainError) return keywordsInstead(`${error.message} Showing keyword matches instead.`);
    console.error("[vibeSearch] embedding failed", error);
    return keywordsInstead("Vibe search is unavailable right now, so these are keyword matches.");
  }
  if (!vector) return keywordsInstead("Vibe search is unavailable right now, so these are keyword matches.");

  const distance = sql<number>`${books.embedding} <=> ${toVectorLiteral(vector)}::vector`;
  const rows = await db
    .select({ ...cardColumns(viewerId), distance })
    .from(books)
    .where(and(isNotNull(books.embedding), ...filterConditions(query)))
    .orderBy(distance)
    .limit(limit);

  return {
    items: rows.map(({ distance: _distance, ...row }) => toCard(row)),
    total: rows.length,
    mode: "vibe",
  };
}

/** Books closest in meaning to a given book (used for "more like this"). */
export async function similarBooks(bookId: string, viewerId: string, limit = 4): Promise<BookCard[]> {
  const [source] = await db
    .select({ embedding: books.embedding })
    .from(books)
    .where(eq(books.id, bookId));
  if (!source?.embedding) return [];
  const distance = sql`${books.embedding} <=> ${toVectorLiteral(source.embedding)}::vector`;
  const rows = await db
    .select(cardColumns(viewerId))
    .from(books)
    .where(and(isNotNull(books.embedding), sql`${books.id} <> ${bookId}`))
    .orderBy(distance)
    .limit(limit);
  return rows.map(toCard);
}

export async function getBookCards(ids: string[], viewerId: string): Promise<BookCard[]> {
  if (ids.length === 0) return [];
  const rows = await db.select(cardColumns(viewerId)).from(books).where(inArray(books.id, ids));
  const byId = new Map(rows.map((row) => [row.id, toCard(row)]));
  return ids.map((id) => byId.get(id)).filter((card): card is BookCard => Boolean(card));
}

export type BookDetail = BookCard & {
  description: string | null;
  publisher: string | null;
  shelfLocation: string | null;
  createdAt: Date;
  updatedAt: Date;
  openLoans: number;
  waitingHolds: number;
  timesBorrowed: number;
  myLoanId: string | null;
  myHoldId: string | null;
  myHoldReadyUntil: Date | null;
  myQueuePosition: number | null;
};

export async function getBookDetail(id: string, viewerId: string): Promise<BookDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({
      ...cardColumns(viewerId),
      description: books.description,
      publisher: books.publisher,
      shelfLocation: books.shelfLocation,
      createdAt: books.createdAt,
      updatedAt: books.updatedAt,
      openLoans: openLoansSql,
      waitingHolds: waitingHoldsSql,
      timesBorrowed: timesBorrowedSql,
    })
    .from(books)
    .where(eq(books.id, id));
  if (!row) return null;

  const [myLoan] = await db
    .select({ id: loans.id })
    .from(loans)
    .where(and(eq(loans.bookId, id), eq(loans.userId, viewerId), sql`${loans.returnedAt} is null`));

  const [myHold] = await db
    .select({ id: holds.id, readyUntil: holds.readyUntil, createdAt: holds.createdAt, status: holds.status })
    .from(holds)
    .where(and(eq(holds.bookId, id), eq(holds.userId, viewerId), inArray(holds.status, ["waiting", "ready"])));

  let myQueuePosition: number | null = null;
  if (myHold?.status === "waiting") {
    const [ahead] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(holds)
      .where(and(eq(holds.bookId, id), eq(holds.status, "waiting"), sql`${holds.createdAt} < ${myHold.createdAt}`));
    myQueuePosition = (ahead?.count ?? 0) + 1;
  }

  return {
    ...toCard(row),
    description: row.description,
    publisher: row.publisher,
    shelfLocation: row.shelfLocation,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    openLoans: row.openLoans,
    waitingHolds: row.waitingHolds,
    timesBorrowed: row.timesBorrowed,
    myLoanId: myLoan?.id ?? null,
    myHoldId: myHold?.id ?? null,
    myHoldReadyUntil: myHold?.readyUntil ?? null,
    myQueuePosition,
  };
}

/** Distinct values for the filter menus. */
export async function getCatalogFacets(): Promise<{ languages: string[]; tags: string[] }> {
  const [languages, tags] = await Promise.all([
    db.selectDistinct({ language: books.language }).from(books).orderBy(books.language),
    db.execute<{ tag: string; n: number }>(
      sql`select tag, count(*)::int as n from ${books}, unnest(${books.genres}) as tag group by tag order by n desc limit 40`,
    ),
  ]);
  return {
    languages: languages.map((row) => row.language),
    tags: tags.rows.map((row) => row.tag),
  };
}

/** Quick lookup for the ⌘K palette and AI tools. */
export async function quickFindBooks(q: string, limit = 6) {
  const term = q.trim();
  if (!term) return [];
  return db
    .select({ id: books.id, title: books.title, authors: books.authors, coverUrl: books.coverUrl, isbn: books.isbn })
    .from(books)
    .where(termMatches(term))
    .orderBy(desc(sql`word_similarity(${term}, ${books.title})`), asc(books.title))
    .limit(limit);
}
