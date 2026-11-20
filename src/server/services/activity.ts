import { desc, eq, sql } from "drizzle-orm";
import type { Actor } from "@/server/auth/permissions";
import { isDemoScoped } from "@/server/auth/scope";
import { db, type Executor } from "@/server/db";
import { activityLog, users } from "@/server/db/schema";

export type ActivityInput = {
  actorId: string | null;
  action: string;
  entityType: "book" | "loan" | "hold" | "user" | "import" | "system";
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/** Records a write. Pass the open transaction so the log commits (or rolls back) with it. */
export async function logActivity(exec: Executor, input: ActivityInput): Promise<void> {
  await exec.insert(activityLog).values({
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
}

export type ActivityItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  actorName: string | null;
};

/**
 * Recent writes. Demo staff only see activity by and about demo accounts,
 * so real members' names never show up in the public demo.
 */
export async function listRecentActivity(actor: Actor, limit = 20): Promise<ActivityItem[]> {
  const scoped = isDemoScoped(actor);
  return db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
      actorName: users.name,
    })
    .from(activityLog)
    .leftJoin(users, eq(users.id, activityLog.actorId))
    .where(
      scoped
        ? sql`(${users.isDemo} = true or ${activityLog.actorId} is null)
            and (${activityLog.metadata}->>'memberId' is null
              or exists (select 1 from users u where u.id = ${activityLog.metadata}->>'memberId' and u.is_demo))`
        : undefined,
    )
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

/** Human sentence for an activity row, e.g. "Leo returned Circe for Maya". */
export function describeActivity(item: ActivityItem): string {
  const who = item.actorName ?? "System";
  const m = item.metadata as Record<string, string | number | undefined>;
  const title = m.title ? `“${m.title}”` : "a book";
  const forWhom = m.memberName && m.memberName !== item.actorName ? ` for ${m.memberName}` : "";
  switch (item.action) {
    case "book.created":
      return `${who} added ${title}`;
    case "book.updated":
      return `${who} edited ${title}`;
    case "book.deleted":
      return `${who} deleted ${title}`;
    case "book.copies_added":
      return `${who} added ${m.count ?? 1} cop${Number(m.count) === 1 ? "y" : "ies"} of ${title}`;
    case "loan.borrowed":
      return `${who} borrowed ${title}${forWhom}`;
    case "loan.returned":
      return `${who} returned ${title}${forWhom}`;
    case "loan.renewed":
      return `${who} renewed ${title}${forWhom}`;
    case "loan.undone":
      return `${who} undid a loan of ${title}`;
    case "loan.return_undone":
      return `${who} undid the return of ${title}`;
    case "hold.placed":
      return `${who} placed a hold on ${title}`;
    case "hold.cancelled":
      return `${who} cancelled a hold on ${title}`;
    case "hold.ready":
      return `A hold on ${title} is ready for ${m.memberName ?? "a member"}`;
    case "hold.expired":
      return `A hold on ${title} expired`;
    case "user.role_changed":
      return `${who} made ${m.memberName ?? "a user"} ${m.role === "admin" ? "an" : "a"} ${m.role}`;
    case "import.completed":
      return `${who} imported ${m.count ?? 0} books from a shelf photo`;
    case "system.reset":
      return "Demo data was reset";
    default:
      return `${who}: ${item.action}`;
  }
}
