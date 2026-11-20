import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { resetDemoData } from "@/server/db/seed";
import { isDemoMode } from "@/server/env";
import { logActivity } from "@/server/services/activity";
import { expireStaleHolds } from "@/server/services/holds";
import { sendDueSoonReminders, sendOverdueReminders } from "@/server/services/notifications";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Daily job (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`):
 * 1. In demo mode, reset and reseed the sandbox.
 * 2. Expire ready holds past their pickup window (the copy passes to the next person).
 * 3. Send due-in-2-days and overdue reminders. Every email is also written to the outbox.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  const summary: Record<string, unknown> = {};

  if (isDemoMode()) {
    await resetDemoData({ log: () => undefined });
    await logActivity(db, { actorId: null, action: "system.reset", entityType: "system" });
    summary.demoReset = true;
  }

  const holds = await expireStaleHolds();
  summary.holdsExpired = holds.expired;
  summary.holdsPromoted = holds.promoted.length;
  summary.dueSoonEmails = await sendDueSoonReminders();
  summary.overdueEmails = await sendOverdueReminders();
  summary.ms = Date.now() - started;

  console.log("[cron] reminders", summary);
  return Response.json({ ok: true, ...summary });
}
