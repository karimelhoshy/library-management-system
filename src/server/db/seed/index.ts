/**
 * Idempotent seed: running it twice leaves the same state.
 * - Demo users and sample readers are upserted by fixed id.
 * - Books are upserted by ISBN (their embeddings are kept).
 * - Loan history uses deterministic ids, so it is only inserted once.
 *
 * Used by `pnpm db:seed`, `pnpm db:reset` and the nightly demo reset in the cron job.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { openLibraryCoverUrl } from "@/lib/isbn";
import { DEMO_USERS } from "@/server/auth/demo-users";
import { db } from "@/server/db";
import {
  activityLog,
  aiMessages,
  aiUsage,
  books,
  emailOutbox,
  holds,
  loans,
  users,
} from "@/server/db/schema";
import { refreshEmbeddings } from "@/server/services/books";
import { notifyHoldsReady, sendDueSoonReminders, sendOverdueReminders } from "@/server/services/notifications";
import { addDays, dueDateFrom, holdReadyUntil } from "@/server/services/rules";
import { SEED_BOOKS, type SeedBook } from "./books-data";

type Log = (message: string) => void;

/** Sample readers who make the loan history look like a real library. */
const READERS = [
  ["reader-priya", "Priya Nair"],
  ["reader-tomas", "Tomás Álvarez"],
  ["reader-hana", "Hana Sato"],
  ["reader-jonah", "Jonah Weiss"],
  ["reader-amara", "Amara Diallo"],
  ["reader-felix", "Felix Novak"],
  ["reader-grace", "Grace Owusu"],
  ["reader-mateo", "Mateo Rossi"],
  ["reader-ines", "Inês Duarte"],
  ["reader-kenji", "Kenji Mori"],
] as const;

const SEED_USER_IDS = [...DEMO_USERS.map((u) => u.id), ...READERS.map(([id]) => id)];

/** Deterministic UUID from a label, so re-running the seed doesn't duplicate rows. */
function seedUuid(label: string): string {
  const hex = createHash("sha256").update(`shelfwise-seed:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Small deterministic PRNG (mulberry32) so the history is the same on every machine. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOUR = 60 * 60 * 1000;

async function seedUsers() {
  const rows = [
    ...DEMO_USERS.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, isDemo: true })),
    ...READERS.map(([id, name]) => ({
      id,
      name,
      email: `${id.replace("reader-", "")}@example.com`,
      role: "member" as const,
      isDemo: true,
    })),
  ];
  await db
    .insert(users)
    .values(rows)
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: sql`excluded.name`,
        email: sql`excluded.email`,
        role: sql`excluded.role`,
        isDemo: sql`excluded.is_demo`,
      },
    });
}

async function seedBooks(now: Date) {
  const rows = SEED_BOOKS.map((book, index) => ({
    title: book.title,
    authors: book.authors,
    isbn: book.isbn,
    coverUrl: openLibraryCoverUrl(book.isbn),
    summary: book.summary,
    description: book.description,
    genres: book.genres,
    publisher: book.publisher,
    year: book.year,
    pages: book.pages,
    language: book.language,
    totalCopies: book.copies,
    shelfLocation: book.shelf,
    createdBy: "demo-leo",
    // A handful of titles are "new this month"; the rest arrived a while ago.
    createdAt: index % 7 === 3 ? addDays(now, -((index % 25) + 2)) : addDays(now, -(120 + index)),
  }));
  await db
    .insert(books)
    .values(rows)
    .onConflictDoUpdate({
      target: books.isbn,
      set: {
        title: sql`excluded.title`,
        authors: sql`excluded.authors`,
        coverUrl: sql`excluded.cover_url`,
        summary: sql`excluded.summary`,
        description: sql`excluded.description`,
        genres: sql`excluded.genres`,
        publisher: sql`excluded.publisher`,
        year: sql`excluded.year`,
        pages: sql`excluded.pages`,
        language: sql`excluded.language`,
        totalCopies: sql`excluded.total_copies`,
        shelfLocation: sql`excluded.shelf_location`,
      },
    });
  const saved = await db
    .select({ id: books.id, isbn: books.isbn, title: books.title, totalCopies: books.totalCopies })
    .from(books)
    .where(inArray(books.isbn, SEED_BOOKS.map((b) => b.isbn)));
  return saved;
}

type SavedBook = { id: string; isbn: string | null; title: string; totalCopies: number };

type PlannedLoan = {
  id: string;
  bookId: string;
  userId: string;
  borrowedAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
  renewCount: number;
  processedBy: string;
};

/**
 * Current state the demo relies on:
 * - Maya: an overdue loan of Circe, a regular loan, and a ready hold on Educated.
 * - Project Hail Mary: all 3 copies out (so the AI can offer a hold).
 * - A few popular titles fully out, one with a waiting queue.
 */
function planCurrentLoans(byTitle: (title: string) => SavedBook | undefined, now: Date) {
  const open: PlannedLoan[] = [];
  const used = new Map<string, number>();
  const add = (title: string, userId: string, daysAgo: number, opts: { renewed?: boolean } = {}) => {
    const book = byTitle(title);
    if (!book) return;
    const count = used.get(book.id) ?? 0;
    if (count >= book.totalCopies) return;
    if (open.some((loan) => loan.bookId === book.id && loan.userId === userId)) return;
    used.set(book.id, count + 1);
    const borrowedAt = new Date(now.getTime() - daysAgo * 24 * HOUR - 3 * HOUR);
    open.push({
      id: seedUuid(`open:${title}:${userId}`),
      bookId: book.id,
      userId,
      borrowedAt,
      dueAt: opts.renewed ? addDays(dueDateFrom(borrowedAt), 14) : dueDateFrom(borrowedAt),
      returnedAt: null,
      renewCount: opts.renewed ? 1 : 0,
      processedBy: userId,
    });
  };

  add("Circe", "demo-maya", 20); // overdue by 6 days
  add("The Night Circus", "demo-maya", 5);
  add("Project Hail Mary", "reader-priya", 6);
  add("Project Hail Mary", "reader-jonah", 9);
  add("Project Hail Mary", "reader-grace", 12);
  add("Educated", "reader-tomas", 4);
  add("The Devotion of Suspect X", "reader-hana", 3);
  add("The Tokyo Zodiac Murders", "reader-kenji", 8);
  add("The Tokyo Zodiac Murders", "reader-felix", 2);
  add("The Tokyo Zodiac Murders", "reader-ines", 11);
  add("Malice", "reader-amara", 7);
  add("Malice", "reader-mateo", 10);
  add("Dune", "reader-felix", 16); // overdue by 2 days
  add("Sapiens", "reader-amara", 13);
  add("Piranesi", "reader-hana", 1);
  add("The Left Hand of Darkness", "reader-jonah", 18); // overdue
  add("Good Omens", "demo-leo", 6);
  add("The Hitchhiker's Guide to the Galaxy", "reader-mateo", 12, { renewed: true });
  add("Before the Coffee Gets Cold", "reader-grace", 3);
  add("Jonathan Strange & Mr Norrell", "demo-ada", 9);
  return open;
}

/** ~100 returned loans over the last 60 days, weighted toward popular titles. */
function planHistory(saved: SavedBook[], now: Date, count = 100): PlannedLoan[] {
  const random = prng(20251120);
  const borrowers = ["demo-maya", "demo-maya", "demo-leo", "demo-ada", ...READERS.map(([id]) => id)];
  // Earlier books in a shuffled order get borrowed more often, so "top borrowed" has a shape.
  const weighted = [...saved].sort((a, b) => (a.isbn ?? "").localeCompare(b.isbn ?? ""));
  const history: PlannedLoan[] = [];
  for (let i = 0; i < count; i++) {
    const pick = Math.floor(Math.pow(random(), 1.8) * weighted.length);
    const book = weighted[pick]!;
    const userId = borrowers[Math.floor(random() * borrowers.length)]!;
    const daysAgo = 3 + Math.pow(random(), 0.85) * 57; // more activity recently
    const borrowedAt = new Date(now.getTime() - daysAgo * 24 * HOUR - Math.floor(random() * 10) * HOUR);
    const keptDays = 2 + Math.floor(random() * 15);
    const returnedAt = new Date(
      Math.min(borrowedAt.getTime() + keptDays * 24 * HOUR, now.getTime() - 2 * HOUR),
    );
    history.push({
      id: seedUuid(`history:${i}`),
      bookId: book.id,
      userId,
      borrowedAt,
      dueAt: dueDateFrom(borrowedAt),
      returnedAt,
      renewCount: keptDays > 14 && random() > 0.5 ? 1 : 0,
      processedBy: random() > 0.6 ? "demo-leo" : userId,
    });
  }
  return history;
}

async function seedLoansAndHolds(saved: SavedBook[], now: Date, log: Log) {
  const titleIndex = new Map(saved.map((b) => [b.title.toLowerCase(), b]));
  const byTitle = (title: string) => titleIndex.get(title.toLowerCase());

  const open = planCurrentLoans(byTitle, now);
  const history = planHistory(saved, now);
  const all = [...history, ...open];

  const inserted = await db
    .insert(loans)
    .values(all)
    .onConflictDoNothing({ target: loans.id })
    .returning({ id: loans.id });
  log(`  loans: ${inserted.length} inserted (${all.length} planned)`);
  if (inserted.length === 0) return; // already seeded

  // Activity feed rows for the seeded history, dated when they happened.
  const names = new Map(
    (await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]),
  );
  const titles = new Map(saved.map((b) => [b.id, b.title]));
  const events = all.flatMap((loan) => {
    const meta = {
      title: titles.get(loan.bookId),
      bookId: loan.bookId,
      memberName: names.get(loan.userId),
      memberId: loan.userId,
    };
    const rows = [
      {
        actorId: loan.processedBy,
        action: "loan.borrowed",
        entityType: "loan",
        entityId: loan.id,
        metadata: meta,
        createdAt: loan.borrowedAt,
      },
    ];
    if (loan.returnedAt) {
      rows.push({
        actorId: loan.processedBy,
        action: "loan.returned",
        entityType: "loan",
        entityId: loan.id,
        metadata: meta,
        createdAt: loan.returnedAt,
      });
    }
    return rows;
  });
  await db.insert(activityLog).values(events);

  // Maya's hold on Educated is ready to pick up (one copy out, one set aside for her).
  const educated = byTitle("Educated");
  if (educated) {
    await db
      .insert(holds)
      .values({
        id: seedUuid("hold:educated:maya"),
        bookId: educated.id,
        userId: "demo-maya",
        status: "ready",
        createdAt: addDays(now, -9),
        readyUntil: holdReadyUntil(addDays(now, -1)),
      })
      .onConflictDoNothing();
  }
  // A queue on a title that is fully out, so renewals there are blocked.
  const zodiac = byTitle("The Tokyo Zodiac Murders");
  if (zodiac) {
    await db
      .insert(holds)
      .values([
        { id: seedUuid("hold:zodiac:priya"), bookId: zodiac.id, userId: "reader-priya", createdAt: addDays(now, -2) },
        { id: seedUuid("hold:zodiac:amara"), bookId: zodiac.id, userId: "reader-amara", createdAt: addDays(now, -1) },
      ])
      .onConflictDoNothing();
  }
}

/** Populates the outbox with the emails the daily job would send right now. */
async function seedOutbox() {
  const [ready] = await db
    .select({
      holdId: holds.id,
      bookId: holds.bookId,
      bookTitle: books.title,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      readyUntil: holds.readyUntil,
    })
    .from(holds)
    .innerJoin(books, eq(books.id, holds.bookId))
    .innerJoin(users, eq(users.id, holds.userId))
    .where(and(eq(holds.status, "ready"), eq(holds.userId, "demo-maya")));
  if (ready?.readyUntil) await notifyHoldsReady([{ ...ready, readyUntil: ready.readyUntil }]);
  await sendDueSoonReminders();
  await sendOverdueReminders();
}

export type SeedOptions = { booksOnly?: boolean; embed?: boolean; log?: Log };

export async function seedDatabase(options: SeedOptions = {}) {
  const log = options.log ?? console.log;
  const now = new Date();
  log("Seeding users…");
  await seedUsers();
  log(`Seeding ${SEED_BOOKS.length} books…`);
  const saved = await seedBooks(now);
  if (!options.booksOnly) {
    log("Seeding loans, holds and activity…");
    await seedLoansAndHolds(saved, now, log);
    await seedOutbox();
  }
  if (options.embed !== false) {
    if (process.env.GEMINI_API_KEY) {
      log("Embedding books for semantic search…");
      const count = await refreshEmbeddings();
      log(`  embedded ${count} books`);
    } else {
      log("GEMINI_API_KEY not set: skipping embeddings (vibe search stays off).");
    }
  }
  log("✓ Seed complete");
}

/**
 * Demo reset: wipes activity and added books, restores the seeded catalog and history.
 * Real (Google) accounts are kept, but their loans, holds and chats are cleared.
 */
export async function resetDemoData(options: SeedOptions = {}) {
  const log = options.log ?? console.log;
  log("Resetting demo data…");
  await db.transaction(async (tx) => {
    await tx.delete(aiMessages);
    await tx.delete(aiUsage);
    await tx.delete(emailOutbox);
    await tx.delete(activityLog);
    await tx.delete(holds);
    await tx.delete(loans);
    await tx
      .delete(books)
      .where(or(isNull(books.isbn), notInArray(books.isbn, SEED_BOOKS.map((b: SeedBook) => b.isbn))));
    await tx.delete(users).where(and(eq(users.isDemo, true), notInArray(users.id, SEED_USER_IDS)));
  });
  await seedDatabase(options);
  log("✓ Reset complete");
}
