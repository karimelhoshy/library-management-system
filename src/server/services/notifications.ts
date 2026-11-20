import { and, eq, gt, isNotNull, isNull, lt, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { books, loans, users } from "@/server/db/schema";
import { sendEmail } from "@/server/email/outbox";
import { dueSoonEmail, holdReadyEmail, overdueEmail } from "@/server/email/templates";
import type { PromotedHold } from "./holds";
import { addDays } from "./rules";

/** Emails each member whose hold just became ready. In-app notices are derived from hold status. */
export async function notifyHoldsReady(promoted: PromotedHold[]): Promise<void> {
  for (const hold of promoted) {
    if (!hold.userEmail) continue;
    const email = holdReadyEmail({
      name: hold.userName,
      title: hold.bookTitle,
      bookId: hold.bookId,
      readyUntil: hold.readyUntil,
    });
    await sendEmail({
      toUserId: hold.userId,
      toEmail: hold.userEmail,
      subject: email.subject,
      html: email.html,
      kind: "hold_ready",
      dedupeKey: `hold_ready:${hold.holdId}`,
    });
  }
}

/** Never let a failed notification undo a successful borrow/return. */
export async function notifyHoldsReadySafely(promoted: PromotedHold[]): Promise<void> {
  try {
    await notifyHoldsReady(promoted);
  } catch (error) {
    console.error("[notifications] hold-ready email failed", error);
  }
}

function openLoansWithMember() {
  return db
    .select({
      loanId: loans.id,
      dueAt: loans.dueAt,
      title: books.title,
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .innerJoin(users, eq(users.id, loans.userId))
    .$dynamic();
}

function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Loans due within the next 2 days get one reminder per due date. */
export async function sendDueSoonReminders(now = new Date()): Promise<number> {
  const rows = await openLoansWithMember().where(
    and(isNull(loans.returnedAt), gt(loans.dueAt, now), lte(loans.dueAt, addDays(now, 2)), isNotNull(users.email)),
  );
  let count = 0;
  for (const row of rows) {
    const email = dueSoonEmail({ name: row.name, title: row.title, dueAt: row.dueAt });
    const result = await sendEmail({
      toUserId: row.userId,
      toEmail: row.email!,
      subject: email.subject,
      html: email.html,
      kind: "due_soon",
      dedupeKey: `due_soon:${row.loanId}:${row.dueAt.toISOString().slice(0, 10)}`,
    });
    if (result !== "duplicate") count++;
  }
  return count;
}

/** Overdue loans get a reminder once a week until they come back. */
export async function sendOverdueReminders(now = new Date()): Promise<number> {
  const rows = await openLoansWithMember().where(
    and(isNull(loans.returnedAt), lt(loans.dueAt, now), isNotNull(users.email)),
  );
  let count = 0;
  for (const row of rows) {
    const email = overdueEmail({ name: row.name, title: row.title, dueAt: row.dueAt });
    const result = await sendEmail({
      toUserId: row.userId,
      toEmail: row.email!,
      subject: email.subject,
      html: email.html,
      kind: "overdue",
      dedupeKey: `overdue:${row.loanId}:${isoWeek(now)}`,
    });
    if (result !== "duplicate") count++;
  }
  return count;
}
