import { and, desc, eq } from "drizzle-orm";
import type { ChatMessage } from "@/components/chat/types";
import { toMiniBook } from "@/server/ai/tools";
import { DomainError, type Actor } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { aiMessages, type AiMessageContent, type AiProposal } from "@/server/db/schema";
import { getBookCards } from "./catalog";
import { placeHold } from "./holds";
import { borrowBook, renewLoan } from "./loans";
import { formatShortDate } from "./rules";

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
  const [message] = await db
    .select()
    .from(aiMessages)
    .where(and(eq(aiMessages.id, messageId), eq(aiMessages.userId, actor.id)));
  if (!message) throw new DomainError("That conversation isn't available any more.", 404);
  const proposal = message.content.proposals?.find((p) => p.id === proposalId);
  if (!proposal) throw new DomainError("That offer isn't available any more.", 404);
  if (proposal.status !== "pending") return proposal;

  let updated: AiProposal;
  if (decision === "dismiss") {
    updated = { ...proposal, status: "dismissed", resultMessage: "No problem, I left it." };
  } else {
    try {
      switch (proposal.kind) {
        case "place_hold": {
          const hold = await placeHold(actor, proposal.bookId);
          updated = {
            ...proposal,
            status: "confirmed",
            resultMessage:
              hold.position === 1
                ? "Hold placed. You're first in line, and we'll email you when it's ready."
                : `Hold placed. You're #${hold.position} in line.`,
          };
          break;
        }
        case "borrow_book": {
          const loan = await borrowBook(actor, { bookId: proposal.bookId });
          updated = {
            ...proposal,
            status: "confirmed",
            resultMessage: `Borrowed! It's due back ${formatShortDate(loan.dueAt)}.`,
          };
          break;
        }
        case "renew_loan": {
          if (!proposal.loanId) throw new DomainError("Missing loan.");
          const renewed = await renewLoan(actor, proposal.loanId);
          updated = { ...proposal, status: "confirmed", resultMessage: `Renewed. Now due ${formatShortDate(renewed.dueAt)}.` };
          break;
        }
      }
    } catch (error) {
      if (!(error instanceof DomainError) && !(error instanceof Error && error.name === "ForbiddenError")) throw error;
      updated = { ...proposal, status: "failed", resultMessage: error.message };
    }
  }

  const proposals = (message.content.proposals ?? []).map((p) => (p.id === proposalId ? updated : p));
  await db
    .update(aiMessages)
    .set({ content: { ...message.content, proposals } })
    .where(eq(aiMessages.id, messageId));
  return updated;
}

export async function listThreadForApi(userId: string) {
  const threadId = await latestThreadId(userId);
  if (!threadId) return { threadId: null, messages: [] as ChatMessage[] };
  const rows = await loadThread(userId, threadId);
  return { threadId, messages: await toChatMessages(userId, rows) };
}

