/** Read-only tools: they look things up and never change data. */
import { z } from "zod";
import { parseCatalogQuery } from "@/lib/validation";
import { getBookCards, searchCatalog, vibeSearch } from "@/server/services/catalog";
import { listMyHolds } from "@/server/services/holds";
import { listMyLoans } from "@/server/services/loans";
import { checkRenewal, formatShortDate, isOverdue } from "@/server/services/rules";
import { bookIdArg, bookIdSchema, brief, defineTool, loadBook, remember } from "./shared";

const searchBooks = defineTool({
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
});

const semanticSearch = defineTool({
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
});

const getBook = defineTool({
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
});

const checkAvailability = defineTool({
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
});

const myLoans = defineTool({
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
});

export const LOOKUP_TOOLS = [searchBooks, semanticSearch, getBook, checkAvailability, myLoans];
