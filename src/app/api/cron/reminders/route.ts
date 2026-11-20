import { timingSafeEqual } from "node:crypto";
import { runDailyJobs } from "@/server/services/daily-jobs";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/** Vercel Cron calls this daily with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await runDailyJobs();
  console.log("[cron] daily jobs", summary);
  return Response.json({ ok: true, ...summary });
}
