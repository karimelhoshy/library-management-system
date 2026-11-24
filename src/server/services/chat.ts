import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { ChatMessage, MiniBook } from "@/lib/chat-types";
import { DomainError, type Actor } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { aiMessages, type AiMessageContent, type AiProposal } from "@/server/db/schema";
import { getBookCards, type BookCard } from "./catalog";
import { placeHold } from "./holds";
import { borrowBook, renewLoan } from "./loans";
import { cardStatus, formatShortDate } from "./rules";

export async function latestThreadId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ threadId: aiMessages.threadId })
    .from(aiMessages)
    .where(eq(aiMessages.userId, userId))
    .orderBy(desc(aiMessages.createdAt))
    .limit(1);
  return row?.threadId ?? null;
}

export async function loadThread(userId: string, threadId: string, limit = 40) {
  const rows = await db
    .select()
    .from(aiMessages)
    .where(and(eq(aiMessages.userId, userId), eq(aiMessages.threadId, threadId)))
    .orderBy(desc(aiMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function saveMessage(
  userId: string,
  threadId: string,
  role: "user" | "assistant",
  content: AiMessageContent,
): Promise<string> {
  const [row] = await db.insert(aiMessages).values({ userId, threadId, role, content }).returning({ id: aiMessages.id });
  return row!.id;
}

/**
 * Stores a proposal on its reply the moment the agent makes it, so the member can confirm
 * the card while the rest of the reply is still streaming.
 */
export async function addProposal(messageId: string, proposal: AiProposal) {
  await db
    .update(aiMessages)
    .set({
      content: sql`jsonb_set(${aiMessages.content}, '{proposals}', coalesce(${aiMessages.content}->'proposals', '[]') || ${JSON.stringify([proposal])}::jsonb)`,
    })
    .where(eq(aiMessages.id, messageId));
}

/** Saves a finished reply's text and books. Proposals stay as they are: one may already be confirmed. */
export async function finishMessage(messageId: string, reply: Omit<AiMessageContent, "proposals">) {
  await db
    .update(aiMessages)
    .set({ content: sql`${aiMessages.content} || ${JSON.stringify(reply)}::jsonb` })
    .where(eq(aiMessages.id, messageId));
}

/** A book as a small card in the chat. */
export function toMiniBook(book: BookCard): MiniBook {
  const status = cardStatus(book);
  const allOut = book.available === 0 && !book.myLoanDueAt && !book.myHoldStatus;
  return {
    id: book.id,
    title: book.title,
    authors: book.authors,
    coverUrl: book.coverUrl,
    statusText: allOut
      ? `0 of ${book.totalCopies} available${book.nextDueAt ? ` · back ${formatShortDate(book.nextDueAt)}` : ""}`
      : status.text,
    tone: status.tone,
  };
}

/** Stored messages → chat UI messages, with book cards refreshed to current availability. */
export async function toChatMessages(
  userId: string,
  rows: { id: string; role: "user" | "assistant"; content: AiMessageContent; createdAt: Date }[],
): Promise<ChatMessage[]> {
  const ids = [...new Set(rows.flatMap((row) => row.content.bookIds ?? []))];
  const cards = new Map((await getBookCards(ids, userId)).map((card) => [card.id, toMiniBook(card)]));
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.content.text,
    error: row.content.error,
    proposals: row.content.proposals,
    books: row.content.bookIds?.map((id) => cards.get(id)).filter((b): b is NonNullable<typeof b> => Boolean(b)),
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * The member confirmed (or dismissed) a proposal from the chat. Confirming runs the
 * same service as the regular UI, so every rule and permission check applies.
 */
export async function resolveProposal(
  actor: Actor,
  messageId: string,
  proposalId: string,
  decision: "confirm" | "dismiss",
): Promise<AiProposal> {
  const gone = new DomainError("That conversation isn't available any more.", 404);
  if (!z.string().uuid().safeParse(messageId).success) throw gone;

  // The message row stays locked until the outcome is saved, so a second confirm (another tab,
  // a double tap) waits, then sees the result instead of running the action again.
  return db.transaction(async (tx) => {
    const [message] = await tx
      .select()
      .from(aiMessages)
      .where(and(eq(aiMessages.id, messageId), eq(aiMessages.userId, actor.id)))
      .for("update");
    if (!message) throw gone;
    const proposal = message.content.proposals?.find((p) => p.id === proposalId);
    if (!proposal) throw new DomainError("That offer isn't available any more.", 404);
    if (proposal.status !== "pending") return proposal;

    const updated = decision === "dismiss" ? dismissed(proposal) : await runProposal(actor, proposal);

    // Replace only this proposal, in place, so nothing the streaming reply saved meanwhile is lost.
    await tx
      .update(aiMessages)
      .set({
        content: sql`jsonb_set(${aiMessages.content}, '{proposals}', (
          select jsonb_agg(case when p->>'id' = ${proposalId} then ${JSON.stringify(updated)}::jsonb else p end order by i)
          from jsonb_array_elements(${aiMessages.content}->'proposals') with ordinality as t(p, i)
        ))`,
      })
      .where(eq(aiMessages.id, messageId));
    return updated;
  });
}

function dismissed(proposal: AiProposal): AiProposal {
  return { ...proposal, status: "dismissed", resultMessage: "No problem, I left it." };
}

/** Runs the confirmed action through the same services as the regular UI. */
async function runProposal(actor: Actor, proposal: AiProposal): Promise<AiProposal> {
  try {
    switch (proposal.kind) {
      case "place_hold": {
        const hold = await placeHold(actor, proposal.bookId);
        return {
          ...proposal,
          status: "confirmed",
          resultMessage:
            hold.position === 1
              ? "Hold placed. You're first in line, and we'll email you when it's ready."
              : `Hold placed. You're #${hold.position} in line.`,
        };
      }
      case "borrow_book": {
        const loan = await borrowBook(actor, { bookId: proposal.bookId });
        return { ...proposal, status: "confirmed", resultMessage: `Borrowed! It's due back ${formatShortDate(loan.dueAt)}.` };
      }
      case "renew_loan": {
        if (!proposal.loanId) throw new DomainError("Missing loan.");
        const renewed = await renewLoan(actor, proposal.loanId);
        return { ...proposal, status: "confirmed", resultMessage: `Renewed. Now due ${formatShortDate(renewed.dueAt)}.` };
      }
    }
  } catch (error) {
    if (!(error instanceof DomainError) && !(error instanceof Error && error.name === "ForbiddenError")) throw error;
    return { ...proposal, status: "failed", resultMessage: error.message };
  }
}

export async function listThreadForApi(userId: string) {
  const threadId = await latestThreadId(userId);
  if (!threadId) return { threadId: null, messages: [] as ChatMessage[] };
  // A reply that never finished (the server stopped mid-turn) has nothing to show.
  const rows = (await loadThread(userId, threadId)).filter(
    (row) => row.role === "user" || row.content.text || row.content.proposals?.length,
  );
  return { threadId, messages: await toChatMessages(userId, rows) };
}

