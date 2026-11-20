import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { DomainError, ForbiddenError } from "@/server/auth/permissions";
import { getCurrentUser, type SessionUser } from "@/server/auth/session";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return (error as { code?: string })?.code === "23505" || cause?.code === "23505";
}

/** Maps service errors to a result the client can show. 403 for permission failures. */
export function toActionError(error: unknown): { ok: false; error: string; status: number } {
  unstable_rethrow(error);
  if (error instanceof ForbiddenError) return { ok: false, status: 403, error: error.message };
  if (error instanceof DomainError) return { ok: false, status: error.status, error: error.message };
  if (error instanceof ZodError) {
    return { ok: false, status: 422, error: error.issues[0]?.message ?? "Please check the form." };
  }
  if (isUniqueViolation(error)) {
    return { ok: false, status: 409, error: "That already exists (it may have just been done)." };
  }
  console.error("[action] unexpected error", error);
  return { ok: false, status: 500, error: "Something went wrong. Please try again." };
}

/** Runs an action for the signed-in user; 401 when signed out. */
export async function withUser<T>(fn: (user: SessionUser) => Promise<T>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "Please sign in again." };
  try {
    return { ok: true, data: await fn(user) };
  } catch (error) {
    return toActionError(error);
  }
}
