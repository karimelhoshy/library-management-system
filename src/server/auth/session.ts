import "server-only";
import { eq } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db";
import { users, type Role } from "@/server/db/schema";
import { auth } from "./index";
import { can, type Action } from "./permissions";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
  isDemo: boolean;
};

/** The signed-in user, loaded fresh from the database once per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
      isDemo: users.isDemo,
    })
    .from(users)
    .where(eq(users.id, id));
  return user ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** For pages: renders the 403 page when the user lacks the permission. */
export async function requirePermission(action: Action): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, action)) forbidden();
  return user;
}
