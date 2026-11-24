import { gt, sql } from "drizzle-orm";
import { assertCan, DomainError, type Actor } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { aiUsage } from "@/server/db/schema";
import { aiDailyBudget } from "@/server/env";

/** Per-user limits, generous enough for a demo but protective of the free Gemini quota. */
export const AI_LIMITS = {
  chat: { max: 40, windowMinutes: 60 },
  vision: { max: 10, windowMinutes: 60 },
  vibe: { max: 120, windowMinutes: 60 },
} as const;

export type AiKind = keyof typeof AI_LIMITS;

const dayAgo = () => new Date(Date.now() - 24 * 60 * 60_000);

/**
 * Database-backed limiter (works across serverless instances). Each user has an hourly allowance
 * per feature, and the whole library shares a daily budget, so a busy public demo can't run
 * through the Gemini quota. Throws a 429 DomainError when either is used up, otherwise records the call.
 */
export async function consumeAiQuota(userId: string, kind: AiKind): Promise<void> {
  const { max, windowMinutes } = AI_LIMITS[kind];
  const since = new Date(Date.now() - windowMinutes * 60_000);
  await db.transaction(async (tx) => {
    // The daily budget is shared, so every check-and-record runs one at a time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ai-usage'))`);
    const [usage] = await tx
      .select({
        mine: sql<number>`(count(*) filter (where ${aiUsage.userId} = ${userId} and ${aiUsage.kind} = ${kind} and ${aiUsage.createdAt} > ${since}))::int`,
        everyone: sql<number>`count(*)::int`,
      })
      .from(aiUsage)
      .where(gt(aiUsage.createdAt, dayAgo()));
    if ((usage?.everyone ?? 0) >= aiDailyBudget()) {
      throw new DomainError("The library's AI allowance for today is used up. Everything else still works.", 429);
    }
    if ((usage?.mine ?? 0) >= max) {
      throw new DomainError(
        `You've reached the limit of ${max} AI ${kind === "vision" ? "photo scans" : "requests"} per hour. Please try again a little later.`,
        429,
      );
    }
    await tx.insert(aiUsage).values({ userId, kind });
  });
}

export type AiUsage = { total: number; budget: number; byKind: Record<AiKind, number> };

/** AI requests across the library in the last 24 hours, against the daily budget. */
export async function getAiUsage(actor: Actor): Promise<AiUsage> {
  assertCan(actor, "desk:read");
  const rows = await db
    .select({ kind: aiUsage.kind, n: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(gt(aiUsage.createdAt, dayAgo()))
    .groupBy(aiUsage.kind);
  const byKind: Record<AiKind, number> = { chat: 0, vision: 0, vibe: 0 };
  for (const row of rows) if (row.kind in byKind) byKind[row.kind as AiKind] = row.n;
  return { total: rows.reduce((sum, row) => sum + row.n, 0), budget: aiDailyBudget(), byKind };
}
