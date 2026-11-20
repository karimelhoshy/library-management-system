import { describe, expect, it } from "vitest";
import {
  addDays,
  availabilityLabel,
  availableCopies,
  canBorrowNow,
  checkRenewal,
  dueDateFrom,
  holdsToPromote,
  isOverdue,
} from "@/server/services/rules";

const now = new Date("2026-11-20T12:00:00Z");

describe("availability math", () => {
  it("is total minus open loans minus ready holds", () => {
    expect(availableCopies({ totalCopies: 3, openLoans: 1, readyHolds: 0 })).toBe(2);
    expect(availableCopies({ totalCopies: 3, openLoans: 1, readyHolds: 1 })).toBe(1);
  });

  it("never goes negative (e.g. copies reduced while on loan)", () => {
    expect(availableCopies({ totalCopies: 1, openLoans: 2, readyHolds: 1 })).toBe(0);
  });

  it("a ready hold is the member's reserved copy, even when nothing is free", () => {
    const counts = { totalCopies: 2, openLoans: 1, readyHolds: 1 };
    expect(canBorrowNow({ ...counts, memberHasReadyHold: true })).toBe(true);
    expect(canBorrowNow({ ...counts, memberHasReadyHold: false })).toBe(false);
  });

  it("the last copy can only go to one borrower", () => {
    const before = { totalCopies: 1, openLoans: 0, readyHolds: 0 };
    expect(canBorrowNow({ ...before, memberHasReadyHold: false })).toBe(true);
    const after = { ...before, openLoans: 1 };
    expect(canBorrowNow({ ...after, memberHasReadyHold: false })).toBe(false);
  });
});

describe("loan dates", () => {
  it("loans are due in 14 days", () => {
    expect(dueDateFrom(now).toISOString()).toBe("2026-12-04T12:00:00.000Z");
  });

  it("detects overdue loans", () => {
    expect(isOverdue({ dueAt: addDays(now, -1), returnedAt: null }, now)).toBe(true);
    expect(isOverdue({ dueAt: addDays(now, 1), returnedAt: null }, now)).toBe(false);
    expect(isOverdue({ dueAt: addDays(now, -1), returnedAt: now }, now)).toBe(false);
  });
});

describe("renewals", () => {
  const loan = { dueAt: addDays(now, 3), renewCount: 0, returnedAt: null };

  it("adds 14 days to the due date", () => {
    const result = checkRenewal(loan, 0, now);
    expect(result.ok && result.newDueAt.toISOString()).toBe(addDays(loan.dueAt, 14).toISOString());
  });

  it("only allows one renewal", () => {
    expect(checkRenewal({ ...loan, renewCount: 1 }, 0, now).ok).toBe(false);
  });

  it("is blocked when someone is waiting", () => {
    const result = checkRenewal(loan, 2, now);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/waiting/);
  });

  it("an overdue renewal still gets a full period from today", () => {
    const overdue = { ...loan, dueAt: addDays(now, -5) };
    const result = checkRenewal(overdue, 0, now);
    expect(result.ok && result.newDueAt.toISOString()).toBe(addDays(now, 14).toISOString());
  });

  it("can't renew a returned loan", () => {
    expect(checkRenewal({ ...loan, returnedAt: now }, 0, now).ok).toBe(false);
  });
});

describe("hold queue", () => {
  const waiting = [
    { id: "late", createdAt: new Date("2026-11-03") },
    { id: "first", createdAt: new Date("2026-11-01") },
    { id: "second", createdAt: new Date("2026-11-02") },
  ];

  it("promotes the oldest holds, one per free copy", () => {
    expect(holdsToPromote({ totalCopies: 3, openLoans: 1, readyHolds: 0 }, waiting)).toEqual(["first", "second"]);
  });

  it("promotes nobody when no copy is free", () => {
    expect(holdsToPromote({ totalCopies: 2, openLoans: 1, readyHolds: 1 }, waiting)).toEqual([]);
  });
});

describe("availability labels", () => {
  it("says Available when every copy is in", () => {
    expect(availabilityLabel({ available: 3, totalCopies: 3, nextDueAt: null })).toEqual({
      tone: "available",
      text: "Available",
    });
  });

  it("shows x of y when some are out", () => {
    expect(availabilityLabel({ available: 2, totalCopies: 3, nextDueAt: null }).text).toBe("2 of 3 available");
  });

  it("shows the next due date when none are in", () => {
    const label = availabilityLabel({ available: 0, totalCopies: 3, nextDueAt: new Date("2026-11-28T10:00:00Z") });
    expect(label).toEqual({ tone: "onloan", text: "Due back Nov 28" });
  });
});
