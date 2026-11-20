import { and, eq, gt, sql } from "drizzle-orm";
import { DomainError } from "@/server/auth/permissions";
import { db } from "@/server/db";
import { aiUsage } from "@/server/db/schema";

/** Per-user limits, generous enough for a demo but protective of the free Gemini quota. */
export const AI_LIMITS = {
  chat: { max: 40, windowMinutes: 60 },
  vision: { max: 10, windowMinutes: 60 },
  vibe: { max: 120, windowMinutes: 60 },
} as const;

export type AiKind = keyof typeof AI_LIMITS;

/**
 * Database-backed limiter (works across serverless instances).
 * Throws a 429 DomainError when the user is over the limit, otherwise records the call.
 */
export async function consumeAiQuota(userId: string, kind: AiKind): Promise<void> {
  const { max, windowMinutes } = AI_LIMITS[kind];
  const since = new Date(Date.now() - windowMinutes * 60_000);
  await db.transaction(async (tx) => {
    // Serialise check-and-record per user+kind so parallel requests can't slip past the limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ai:${userId}:${kind}`}))`);
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), eq(aiUsage.kind, kind), gt(aiUsage.createdAt, since)));
    if ((row?.n ?? 0) >= max) {
      throw new DomainError(
        `You've reached the limit of ${max} AI ${kind === "vision" ? "photo scans" : "requests"} per hour. Please try again a little later.`,
        429,
      );
    }
    await tx.insert(aiUsage).values({ userId, kind });
  });
}
