import type { Actor } from "./permissions";
import { isDemoMode } from "@/server/env";

/**
 * In a public demo, anyone can sign in as the demo admin or librarian. Those demo
 * accounts must not see or change real (e.g. Google) accounts: staff views and role
 * changes are limited to demo users whenever this returns true.
 */
export function isDemoScoped(actor: Actor): boolean {
  return isDemoMode() && actor.isDemo === true;
}
