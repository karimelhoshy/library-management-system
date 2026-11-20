import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Action } from "@/server/auth/permissions";
import type { SessionUser } from "@/server/auth/session";
import type { AiProposal } from "@/server/db/schema";
import { getBookDetail, type BookCard } from "@/server/services/catalog";
import { formatShortDate } from "@/server/services/rules";

export type ToolContext = {
  user: SessionUser;
  /** Books the agent has seen this turn, so we can show the ones it mentions as cards. */
  seenBooks: Map<string, BookCard>;
  proposals: AiProposal[];
};

export type ToolDef<A extends z.ZodType> = {
  name: string;
  description: string;
  /** Shown in the chat while the tool runs. */
  status: string;
  permission: Action;
  args: A;
  /** JSON Schema sent to Gemini (`parametersJsonSchema`). */
  parameters: Record<string, unknown>;
  run: (args: z.output<A>, ctx: ToolContext) => Promise<unknown>;
};

/** Identity helper so each tool's `run` gets typed args from its zod schema. */
export function defineTool<A extends z.ZodType>(def: ToolDef<A>) {
  return def;
}

export const bookIdArg = z.object({ book_id: z.string().uuid() });
export const bookIdSchema = {
  type: "object",
  properties: { book_id: { type: "string", description: "The book_id from a search result." } },
  required: ["book_id"],
};

/** Compact, model-friendly view of a book. */
export function brief(book: BookCard) {
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

export function remember(ctx: ToolContext, books: BookCard[]) {
  for (const book of books) ctx.seenBooks.set(book.id, book);
}

export async function loadBook(ctx: ToolContext, bookId: string) {
  const book = await getBookDetail(bookId, ctx.user.id);
  if (!book) return null;
  remember(ctx, [book]);
  return book;
}

/** Queues a confirmation card for the member. Nothing changes until they press it. */
export function propose(ctx: ToolContext, proposal: Omit<AiProposal, "id" | "status">) {
  ctx.proposals.push({ ...proposal, id: randomUUID(), status: "pending" });
  return {
    status: "awaiting_member_confirmation",
    note: "A confirmation card is now shown to the member. Nothing has happened yet; tell them to confirm on the card.",
  };
}
