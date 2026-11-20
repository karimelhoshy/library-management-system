"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changeRole } from "@/server/services/users";
import { withUser, type ActionResult } from "./result";

const roleSchema = z.enum(["admin", "librarian", "member"]);

export async function changeRoleAction(userId: string, role: string): Promise<ActionResult> {
  const result = await withUser(async (user) => {
    await changeRole(user, userId, roleSchema.parse(role));
    return null;
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
