import { db } from "@/server/db";
import { resetDemoData } from "@/server/db/seed";
import { isDemoMode } from "@/server/env";
import { logActivity } from "./activity";
import { expireStaleHolds } from "./holds";
import { sendDueSoonReminders, sendOverdueReminders } from "./notifications";

/**
 * The daily job, run by Vercel Cron through /api/cron/reminders:
 * 1. In demo mode, reset and reseed the sandbox.
 * 2. Expire ready holds past their pickup window (the copy passes to the next person).
 * 3. Send due-in-2-days and overdue reminders. Every email is also written to the outbox.
 */
export async function runDailyJobs() {
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
  return summary;
}
