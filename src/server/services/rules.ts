/**
 * Pure library rules. No database access here, so they are easy to unit-test
 * and shared by the services, the UI and the AI tools.
 */
import { HOLD_READY_DAYS, LOAN_DAYS, MAX_RENEWALS } from "@/lib/config";

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function dueDateFrom(borrowedAt: Date): Date {
  return addDays(borrowedAt, LOAN_DAYS);
}

export function holdReadyUntil(from: Date): Date {
  return addDays(from, HOLD_READY_DAYS);
}

export type CopyCounts = {
  totalCopies: number;
  /** Loans that have not been returned yet. */
  openLoans: number;
  /** Holds in "ready" status: a returned copy set aside for a specific member. */
  readyHolds: number;
};

/**
 * Copies anyone can walk away with right now.
 * Availability is always computed, never stored: total − on loan − set aside for holds.
 */
export function availableCopies({ totalCopies, openLoans, readyHolds }: CopyCounts): number {
  return Math.max(0, totalCopies - openLoans - readyHolds);
}

/** Can this member borrow now? A ready hold for them counts as their reserved copy. */
export function canBorrowNow(counts: CopyCounts & { memberHasReadyHold: boolean }): boolean {
  return counts.memberHasReadyHold || availableCopies(counts) > 0;
}

/**
 * When copies free up, the oldest waiting holds become ready, one per free copy.
 * Returns the ids of the holds to promote, in queue order.
 */
export function holdsToPromote(
  counts: CopyCounts,
  waitingHolds: { id: string; createdAt: Date }[],
): string[] {
  const free = availableCopies(counts);
  if (free === 0) return [];
  return [...waitingHolds]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, free)
    .map((hold) => hold.id);
}

export type RenewCheck = { ok: true; newDueAt: Date } | { ok: false; reason: string };

export function checkRenewal(
  loan: { dueAt: Date; renewCount: number; returnedAt: Date | null },
  waitingHolds: number,
  now: Date = new Date(),
): RenewCheck {
  if (loan.returnedAt) return { ok: false, reason: "This loan has already been returned." };
  if (loan.renewCount >= MAX_RENEWALS) {
    return { ok: false, reason: "Loans can only be renewed once." };
  }
  if (waitingHolds > 0) {
    return { ok: false, reason: "Someone is waiting for this book, so it can't be renewed." };
  }
  // Renew from the later of today or the current due date, so an overdue
  // renewal still gives the member a full loan period.
  const base = loan.dueAt.getTime() > now.getTime() ? loan.dueAt : now;
  return { ok: true, newDueAt: addDays(base, LOAN_DAYS) };
}

export function isOverdue(loan: { dueAt: Date; returnedAt: Date | null }, now = new Date()) {
  return !loan.returnedAt && loan.dueAt.getTime() < now.getTime();
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export type AvailabilityTone = "available" | "onloan";

export type AvailabilityLabel = { tone: AvailabilityTone; text: string };

/** Card label: "Available", "2 of 3 available" or "Due back Nov 28". */
export function availabilityLabel(input: {
  available: number;
  totalCopies: number;
  nextDueAt: Date | null;
}): AvailabilityLabel {
  const { available, totalCopies, nextDueAt } = input;
  if (totalCopies === 0) return { tone: "onloan", text: "Not in stock" };
  if (available >= totalCopies) return { tone: "available", text: "Available" };
  if (available > 0) {
    return { tone: "available", text: `${available} of ${totalCopies} available` };
  }
  if (nextDueAt) return { tone: "onloan", text: `Due back ${formatShortDate(nextDueAt)}` };
  return { tone: "onloan", text: "On hold" };
}

const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Nov 28". Dates are shown in UTC so server and client render the same text. */
export function formatShortDate(date: Date): string {
  return shortDate.format(date);
}

export type CardStatus = { tone: AvailabilityTone | "ready" | "mine"; text: string };

/** Card status from the viewer's point of view first, then general availability. */
export function cardStatus(book: {
  available: number;
  totalCopies: number;
  nextDueAt: Date | null;
  myLoanDueAt: Date | null;
  myHoldStatus: "waiting" | "ready" | null;
}): CardStatus {
  if (book.myLoanDueAt) return { tone: "mine", text: `On loan to you · due ${formatShortDate(book.myLoanDueAt)}` };
  if (book.myHoldStatus === "ready") return { tone: "ready", text: "Ready for you to pick up" };
  if (book.myHoldStatus === "waiting") return { tone: "onloan", text: "You're in the queue" };
  return availabilityLabel(book);
}
