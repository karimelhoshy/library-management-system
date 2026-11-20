import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { isDemoMode } from "@/server/env";
import { assertCan, can, ForbiddenError, type Actor } from "./permissions";

/**
 * In a public demo, anyone can sign in as the demo admin or librarian. Those demo
 * accounts must not see or change real (e.g. Google) accounts: staff views and role
 * changes are limited to demo users whenever this returns true.
 */
export function isDemoScoped(actor: Actor): boolean {
  return isDemoMode() && actor.isDemo === true;
}

/**
 * Gate for acting on a member's loans or holds. Acting for yourself needs `loan:self`;
 * acting for someone else needs `loan:any`, and demo staff may only act for demo accounts.
 */
export async function assertCanActFor(actor: Actor, memberId: string): Promise<void> {
  if (memberId === actor.id) {
    assertCan(actor, "loan:self");
    return;
  }
  if (!can(actor, "loan:any")) throw new ForbiddenError();
  if (isDemoScoped(actor)) {
    const [target] = await db.select({ isDemo: users.isDemo }).from(users).where(eq(users.id, memberId));
    if (!target?.isDemo) throw new ForbiddenError("In the demo, you can only act for demo accounts.");
  }
}
