import { asc, eq, sql } from "drizzle-orm";
import { assertCan, DomainError, ForbiddenError, type Actor } from "@/server/auth/permissions";
import { isDemoScoped } from "@/server/auth/scope";
import { db } from "@/server/db";
import { users, type Role } from "@/server/db/schema";
import { logActivity } from "./activity";

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
  isDemo: boolean;
  createdAt: Date;
  openLoans: number;
  overdue: number;
  activeHolds: number;
};

export async function listUsers(actor: Actor): Promise<UserRow[]> {
  assertCan(actor, "user:manage");
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
      isDemo: users.isDemo,
      createdAt: users.createdAt,
      openLoans: sql<number>`(select count(*)::int from loans l where l.user_id = "users"."id" and l.returned_at is null)`,
      overdue: sql<number>`(select count(*)::int from loans l where l.user_id = "users"."id" and l.returned_at is null and l.due_at < now())`,
      activeHolds: sql<number>`(select count(*)::int from holds h where h.user_id = "users"."id" and h.status in ('waiting', 'ready'))`,
    })
    .from(users)
    .where(isDemoScoped(actor) ? eq(users.isDemo, true) : undefined)
    .orderBy(sql`case ${users.role} when 'admin' then 0 when 'librarian' then 1 else 2 end`, asc(users.name));
}

/** Members a librarian can lend to (loans desk "borrow on behalf"). */
export async function listMembers(actor: Actor) {
  assertCan(actor, "loan:any");
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(isDemoScoped(actor) ? eq(users.isDemo, true) : undefined)
    .orderBy(asc(users.name));
}

export async function changeRole(actor: Actor, userId: string, role: Role): Promise<void> {
  assertCan(actor, "user:manage");
  if (userId === actor.id) {
    throw new DomainError("You can't change your own role. Ask another admin.");
  }
  if (isDemoScoped(actor)) {
    const [target] = await db.select({ isDemo: users.isDemo }).from(users).where(eq(users.id, userId));
    if (!target?.isDemo) throw new ForbiddenError("In the demo, you can only change demo accounts.");
  }
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ role })
      .where(eq(users.id, userId))
      .returning({ name: users.name });
    if (!updated) throw new DomainError("User not found.", 404);
    await logActivity(tx, {
      actorId: actor.id,
      action: "user.role_changed",
      entityType: "user",
      entityId: userId,
      metadata: { memberName: updated.name, memberId: userId, role },
    });
  });
}
