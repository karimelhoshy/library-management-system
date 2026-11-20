/**
 * Tools the Ask-the-Librarian agent can call. Each maps to a domain service and a
 * `can()` check, exactly like the server actions. Write tools (place_hold, borrow_book,
 * renew_loan) never change anything: they return a proposal that the member must confirm.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cardStatus } from "@/components/books/card-status";
import type { MiniBook } from "@/components/chat/types";
import { parseCatalogQuery } from "@/lib/validation";
import { assertCan, type Action } from "@/server/auth/permissions";
import type { SessionUser } from "@/server/auth/session";
import type { AiProposal } from "@/server/db/schema";
import { getBookCards, getBookDetail, searchCatalog, vibeSearch, type BookCard } from "@/server/services/catalog";
import { listMyHolds } from "@/server/services/holds";
import { listMyLoans } from "@/server/services/loans";
import { checkRenewal, dueDateFrom, formatShortDate, isOverdue } from "@/server/services/rules";

export type ToolContext = {
  user: SessionUser;
  /** Books the agent has seen this turn, so we can show the ones it mentions as cards. */
  seenBooks: Map<string, BookCard>;
  proposals: AiProposal[];
};

type ToolDef<A extends z.ZodType> = {
  name: string;
  description: string;
  status: string;
  permission: Action;
  args: A;
  parameters: Record<string, unknown>;
  run: (args: z.output<A>, ctx: ToolContext) => Promise<unknown>;
};

function defineTool<A extends z.ZodType>(def: ToolDef<A>) {
  return def;
}

/** Compact, model-friendly view of a book. */
function brief(book: BookCard) {
  return {
    book_id: book.id,
    title: book.title,
    authors: book.authors,
    year: book.year,
    pages: book.pages,
    genres: book.genres,
    summary: book.summary,
    language: book.language,
    copies_available: book.available,
    total_copies: book.totalCopies,
    next_due_back: book.available === 0 && book.nextDueAt ? formatShortDate(book.nextDueAt) : null,
    member_status: book.myLoanDueAt
      ? `on loan to this member, due ${formatShortDate(book.myLoanDueAt)}`
      : book.myHoldStatus === "ready"
        ? "a copy is set aside for this member"
        : book.myHoldStatus === "waiting"
          ? "member is in the hold queue"
          : null,
  };
}

function remember(ctx: ToolContext, books: BookCard[]) {
  for (const book of books) ctx.seenBooks.set(book.id, book);
}

const bookIdArg = z.object({ book_id: z.string().uuid() });
const bookIdSchema = {
  type: "object",
  properties: { book_id: { type: "string", description: "The book_id from a search result." } },
  required: ["book_id"],
};

async function loadBook(ctx: ToolContext, bookId: string) {
  const book = await getBookDetail(bookId, ctx.user.id);
  if (!book) return null;
  remember(ctx, [book]);
  return book;
}

function propose(ctx: ToolContext, proposal: Omit<AiProposal, "id" | "status">) {
  const full: AiProposal = { ...proposal, id: randomUUID(), status: "pending" };
  ctx.proposals.push(full);
  return {
    status: "awaiting_member_confirmation",
    note: "A confirmation card is now shown to the member. Nothing has happened yet; tell them to confirm on the card.",
  };
}

export const TOOLS = [
  defineTool({
    name: "search_books",
    description:
      "Keyword search over the library catalog by title, author, ISBN or tag (typo-tolerant). Use for specific titles, authors or genres.",
    status: "Searching the catalog…",
    permission: "catalog:read",
    args: z.object({
      query: z.string().max(200).default(""),
      genre: z.string().max(60).optional(),
      available_only: z.boolean().optional(),
      max_pages: z.number().int().positive().optional(),
    }),
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to match against title, author, ISBN and tags. May be empty when filtering." },
        genre: {
          type: "string",
          description:
            "Optional primary genre: Literary Fiction, Mystery, Science Fiction, Fantasy, Humor, History, Memoir or Science.",
        },
        available_only: { type: "boolean", description: "Only books with a copy on the shelf right now." },
        max_pages: { type: "integer", description: "Only books with at most this many pages." },
      },
      required: ["query"],
    },
    async run(args, ctx) {
      const query = parseCatalogQuery({
        q: args.query,
        genre: args.genre,
        available: args.available_only ? "1" : undefined,
        maxPages: args.max_pages ? String(args.max_pages) : undefined,
      });
      const result = await searchCatalog(query, ctx.user.id, 8);
      remember(ctx, result.items);
      return { total_matches: result.total, books: result.items.map(brief) };
    },
  }),
  defineTool({
    name: "semantic_search",
    description:
      "Find books by meaning, mood or vibe (e.g. 'cozy mystery set in Japan', 'something like Piranesi'). Use for vague or descriptive requests.",
    status: "Looking for books with that feel…",
    permission: "catalog:read",
    args: z.object({ description: z.string().min(1).max(300), available_only: z.boolean().optional() }),
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "What the member is in the mood for, in natural language." },
        available_only: { type: "boolean", description: "Only books with a copy on the shelf right now." },
      },
      required: ["description"],
    },
    async run(args, ctx) {
      const query = parseCatalogQuery({ q: args.description, vibe: "1", available: args.available_only ? "1" : undefined });
      const result = await vibeSearch(query, ctx.user.id, 8);
      remember(ctx, result.items);
      return { mode: result.mode, books: result.items.map(brief) };
    },
  }),
  defineTool({
    name: "get_book",
    description: "Full details of one book: description, publisher, shelf, availability and the member's status.",
    status: "Checking the shelf…",
    permission: "catalog:read",
    args: bookIdArg,
    parameters: bookIdSchema,
    async run(args, ctx) {
      const book = await loadBook(ctx, args.book_id);
      if (!book) return { error: "No book with that id." };
      return {
        ...brief(book),
        description: book.description,
        publisher: book.publisher,
        shelf: book.shelfLocation,
        people_waiting: book.waitingHolds,
        times_borrowed: book.timesBorrowed,
      };
    },
  }),
  defineTool({
    name: "check_availability",
    description: "Whether a book can be borrowed right now, when the next copy is due back, and how long the hold queue is.",
    status: "Checking availability…",
    permission: "catalog:read",
    args: bookIdArg,
    parameters: bookIdSchema,
    async run(args, ctx) {
      const book = await loadBook(ctx, args.book_id);
      if (!book) return { error: "No book with that id." };
      return {
        title: book.title,
        copies_available: book.available,
        total_copies: book.totalCopies,
        next_due_back: book.nextDueAt ? formatShortDate(book.nextDueAt) : null,
        people_waiting: book.waitingHolds,
        member_can_borrow_now: book.available > 0 || book.myHoldStatus === "ready",
        member_status: brief(book).member_status,
        member_queue_position: book.myQueuePosition,
      };
    },
  }),
  defineTool({
    name: "my_loans",
    description: "The member's current loans (with due dates and whether each can be renewed) and their holds.",
    status: "Looking at your loans…",
    permission: "loan:self",
    args: z.object({}),
    parameters: { type: "object", properties: {} },
    async run(_args, ctx) {
      const [loans, holds] = await Promise.all([listMyLoans(ctx.user.id), listMyHolds(ctx.user.id)]);
      remember(ctx, await getBookCards([...loans.map((l) => l.bookId), ...holds.map((h) => h.bookId)], ctx.user.id));
      const now = new Date();
      return {
        today: formatShortDate(now),
        loans: loans.map((loan) => {
          const renewal = checkRenewal(loan, loan.waitingHolds, now);
          return {
            loan_id: loan.id,
            book_id: loan.bookId,
            title: loan.title,
            due: formatShortDate(loan.dueAt),
            overdue: isOverdue(loan, now),
            can_renew: renewal.ok,
            renew_blocked_because: renewal.ok ? null : renewal.reason,
          };
        }),
        holds: holds.map((hold) => ({
          book_id: hold.bookId,
          title: hold.title,
          status: hold.status,
          ready_until: hold.readyUntil ? formatShortDate(hold.readyUntil) : null,
          queue_position: hold.position,
        })),
      };
    },
  }),
  defineTool({
    name: "place_hold",
    description:
      "Propose placing a hold on a book with no copies available. Shows the member a confirmation card; nothing happens until they confirm.",
    status: "Preparing a hold…",
    permission: "hold:self",
    args: bookIdArg,
    parameters: bookIdSchema,
    async run(args, ctx) {
      const book = await loadBook(ctx, args.book_id);
      if (!book) return { error: "No book with that id." };
      if (book.myLoanId) return { error: "The member already has this book on loan." };
      if (book.myHoldStatus) return { error: "The member already has a hold on this book." };
      if (book.available > 0) {
        return { error: "A copy is available right now, so propose borrow_book instead of a hold." };
      }
      const position = book.waitingHolds + 1;
      return propose(ctx, {
        kind: "place_hold",
        bookId: book.id,
        title: book.title,
        detail:
          (position === 1 ? "You'd be first in line" : `You'd be #${position} in line`) +
          (book.nextDueAt ? `. The next copy is due back ${formatShortDate(book.nextDueAt)}.` : "."),
      });
    },
  }),
  defineTool({
    name: "borrow_book",
    description:
      "Propose borrowing a book for the member (14-day loan). Shows a confirmation card; nothing happens until they confirm.",
    status: "Preparing the loan…",
    permission: "loan:self",
    args: bookIdArg,
    parameters: bookIdSchema,
    async run(args, ctx) {
      const book = await loadBook(ctx, args.book_id);
      if (!book) return { error: "No book with that id." };
      if (book.myLoanId) return { error: "The member already has this book on loan." };
      if (book.available === 0 && book.myHoldStatus !== "ready") {
        return { error: "No copies are free. Offer place_hold instead." };
      }
      return propose(ctx, {
        kind: "borrow_book",
        bookId: book.id,
        title: book.title,
        detail: `14-day loan, due back ${formatShortDate(dueDateFrom(new Date()))}.`,
      });
    },
  }),
  defineTool({
    name: "renew_loan",
    description:
      "Propose renewing one of the member's loans for 14 more days (allowed once, only if nobody is waiting). Shows a confirmation card.",
    status: "Checking the renewal…",
    permission: "loan:self",
    args: z.object({ loan_id: z.string().uuid() }),
    parameters: {
      type: "object",
      properties: { loan_id: { type: "string", description: "The loan_id from my_loans." } },
      required: ["loan_id"],
    },
    async run(args, ctx) {
      const loans = await listMyLoans(ctx.user.id);
      const loan = loans.find((l) => l.id === args.loan_id);
      if (!loan) return { error: "That isn't one of the member's open loans." };
      const check = checkRenewal(loan, loan.waitingHolds);
      if (!check.ok) return { error: check.reason };
      remember(ctx, await getBookCards([loan.bookId], ctx.user.id));
      return propose(ctx, {
        kind: "renew_loan",
        bookId: loan.bookId,
        loanId: loan.id,
        title: loan.title,
        detail: `New due date: ${formatShortDate(check.newDueAt)} (was ${formatShortDate(loan.dueAt)}).`,
      });
    },
  }),
];

export const TOOL_DECLARATIONS = TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.parameters,
}));

export function toolStatus(name: string): string {
  return TOOLS.find((tool) => tool.name === name)?.status ?? "Working on it…";
}

/** Runs a tool call from the model: validates args, checks permission, never throws. */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool ${name}.` };
  try {
    assertCan(ctx.user, tool.permission);
    const args = tool.args.parse(rawArgs ?? {});
    return await (tool.run as (a: unknown, c: ToolContext) => Promise<unknown>)(args, ctx);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: `Invalid arguments: ${error.issues[0]?.message}` };
    if (error instanceof Error && error.name === "ForbiddenError") return { error: "Not allowed for this member." };
    console.error(`[ai] tool ${name} failed`, error);
    return { error: "That lookup failed. Try a different approach." };
  }
}

/** Mini cards for the chat UI. */
export function toMiniBook(book: BookCard): MiniBook {
  const status = cardStatus(book);
  return {
    id: book.id,
    title: book.title,
    authors: book.authors,
    coverUrl: book.coverUrl,
    statusText: book.available === 0 && !book.myLoanDueAt && !book.myHoldStatus
      ? `${book.available} of ${book.totalCopies} available${book.nextDueAt ? ` · back ${formatShortDate(book.nextDueAt)}` : ""}`
      : status.text,
    tone: status.tone,
  };
}
