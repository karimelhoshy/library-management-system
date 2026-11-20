import type { BookCard } from "@/server/services/catalog";
import { availabilityLabel, formatShortDate } from "@/server/services/rules";

export type CardStatus = { tone: "available" | "onloan" | "ready" | "mine"; text: string };

/** Card status from the viewer's point of view first, then general availability. */
export function cardStatus(book: BookCard): CardStatus {
  if (book.myLoanDueAt) return { tone: "mine", text: `On loan to you · due ${formatShortDate(book.myLoanDueAt)}` };
  if (book.myHoldStatus === "ready") return { tone: "ready", text: "Ready for you to pick up" };
  if (book.myHoldStatus === "waiting") return { tone: "onloan", text: "You're in the queue" };
  const label = availabilityLabel(book);
  return { tone: label.tone, text: label.tone === "available" ? `${label.text}` : label.text };
}
