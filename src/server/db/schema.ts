import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

export const EMBEDDING_DIMENSIONS = 768;

export const roleEnum = pgEnum("role", ["admin", "librarian", "member"]);
export const holdStatusEnum = pgEnum("hold_status", [
  "waiting",
  "ready",
  "fulfilled",
  "cancelled",
  "expired",
]);
export const emailStatusEnum = pgEnum("email_status", ["sent", "failed", "skipped"]);
export const aiRoleEnum = pgEnum("ai_role", ["user", "assistant"]);

export type Role = (typeof roleEnum.enumValues)[number];
export type HoldStatus = (typeof holdStatusEnum.enumValues)[number];

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow();

/* ------------------------------------------------------------------ */
/* Auth.js tables (property names follow the Drizzle adapter contract) */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  role: roleEnum("role").notNull().default("member"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    authors: text("authors").array().notNull().default(sql`'{}'::text[]`),
    isbn: text("isbn").unique(),
    coverUrl: text("cover_url"),
    /** One-line hook shown on catalog cards. */
    summary: text("summary"),
    description: text("description"),
    genres: text("genres").array().notNull().default(sql`'{}'::text[]`),
    publisher: text("publisher"),
    year: integer("year"),
    pages: integer("pages"),
    language: text("language").notNull().default("English"),
    totalCopies: integer("total_copies").notNull().default(1),
    shelfLocation: text("shelf_location"),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    /** Hash of the text that produced `embedding`, so we only re-embed on change. */
    embeddingHash: text("embedding_hash"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("books_total_copies_nonnegative", sql`${t.totalCopies} >= 0`),
    index("books_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    index("books_genres_idx").using("gin", t.genres),
    index("books_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const loans = pgTable(
  "loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    borrowedAt: timestamp("borrowed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true, mode: "date" }).notNull(),
    returnedAt: timestamp("returned_at", { withTimezone: true, mode: "date" }),
    renewCount: integer("renew_count").notNull().default(0),
    processedBy: text("processed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("loans_open_by_book_idx").on(t.bookId).where(sql`${t.returnedAt} is null`),
    index("loans_user_idx").on(t.userId),
    index("loans_borrowed_at_idx").on(t.borrowedAt),
    // A member can hold at most one open loan per title.
    uniqueIndex("loans_one_open_per_user_book")
      .on(t.bookId, t.userId)
      .where(sql`${t.returnedAt} is null`),
  ],
);

export const holds = pgTable(
  "holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: holdStatusEnum("status").notNull().default("waiting"),
    createdAt: createdAt(),
    readyUntil: timestamp("ready_until", { withTimezone: true, mode: "date" }),
  },
  (t) => [
    index("holds_book_status_idx").on(t.bookId, t.status, t.createdAt),
    index("holds_user_idx").on(t.userId),
    // One active hold per member per title.
    uniqueIndex("holds_one_active_per_user_book")
      .on(t.bookId, t.userId)
      .where(sql`${t.status} in ('waiting', 'ready')`),
  ],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activity_created_at_idx").on(t.createdAt)],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toUserId: text("to_user_id").references(() => users.id, { onDelete: "set null" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    kind: text("kind").notNull(),
    status: emailStatusEnum("status").notNull(),
    error: text("error"),
    /** Prevents the daily job from sending the same reminder twice. */
    dedupeKey: text("dedupe_key").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("email_outbox_created_at_idx").on(t.createdAt)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").notNull(),
    role: aiRoleEnum("role").notNull(),
    content: jsonb("content").$type<AiMessageContent>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ai_messages_thread_idx").on(t.userId, t.threadId, t.createdAt)],
);

/** Lightweight usage log for per-user AI rate limiting. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_user_kind_idx").on(t.userId, t.kind, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* JSON payloads                                                       */
/* ------------------------------------------------------------------ */

export type AiProposalKind = "place_hold" | "borrow_book" | "renew_loan";

export type AiProposal = {
  id: string;
  kind: AiProposalKind;
  /** Book the action targets (for renewals, the book on loan). */
  bookId: string;
  loanId?: string;
  title: string;
  detail: string;
  status: "pending" | "confirmed" | "dismissed" | "failed";
  resultMessage?: string;
};

export type AiMessageContent = {
  text: string;
  /** Ids of books to render as mini cards under the message. */
  bookIds?: string[];
  proposals?: AiProposal[];
  error?: boolean;
};

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const usersRelations = relations(users, ({ many }) => ({
  loans: many(loans, { relationName: "loanUser" }),
  holds: many(holds),
}));

export const booksRelations = relations(books, ({ many }) => ({
  loans: many(loans),
  holds: many(holds),
}));

export const loansRelations = relations(loans, ({ one }) => ({
  book: one(books, { fields: [loans.bookId], references: [books.id] }),
  user: one(users, { fields: [loans.userId], references: [users.id], relationName: "loanUser" }),
}));

export const holdsRelations = relations(holds, ({ one }) => ({
  book: one(books, { fields: [holds.bookId], references: [books.id] }),
  user: one(users, { fields: [holds.userId], references: [users.id] }),
}));

export const activityRelations = relations(activityLog, ({ one }) => ({
  actor: one(users, { fields: [activityLog.actorId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
export type Loan = typeof loans.$inferSelect;
export type Hold = typeof holds.$inferSelect;
