"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/server/auth";
import { isDemoUserId } from "@/server/auth/demo-users";
import { getCurrentUser } from "@/server/auth/session";
import type { Role } from "@/server/db/schema";
import { isDemoMode } from "@/server/env";
import type { ActionResult } from "./result";

/** Switches the real session to a seeded demo user. Server-side permissions follow. */
export async function signInAsDemo(userId: string): Promise<ActionResult<{ role: Role }>> {
  if (!isDemoMode()) return { ok: false, status: 403, error: "Demo accounts are turned off." };
  if (!isDemoUserId(userId)) return { ok: false, status: 400, error: "Unknown demo account." };
  try {
    await signIn("demo", { userId, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, status: 401, error: "That demo account isn't available. Has the database been seeded?" };
    }
    throw error;
  }
  const user = await getCurrentUser();
  return { ok: true, data: { role: user?.role ?? "member" } };
}

export async function signInWithGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" });
}
