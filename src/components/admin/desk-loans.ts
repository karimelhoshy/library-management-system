import type { LoanRow } from "@/server/services/loans";
import { daysBetween, formatShortDate } from "@/server/services/rules";
import type { DeskLoan } from "./loan-desk-list";

/** Server-side formatting for the loans desk rows. */
export function toDeskLoans(loans: LoanRow[], now = new Date()): DeskLoan[] {
  return loans.map((loan) => ({
    id: loan.id,
    bookId: loan.bookId,
    title: loan.title,
    coverUrl: loan.coverUrl,
    memberName: loan.memberName ?? loan.memberEmail ?? "Member",
    memberEmail: loan.memberEmail,
    borrowedLabel: formatShortDate(loan.borrowedAt),
    dueLabel: formatShortDate(loan.dueAt),
    daysLate: Math.max(0, daysBetween(loan.dueAt, now)),
  }));
}
