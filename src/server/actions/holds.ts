"use server";

import { revalidatePath } from "next/cache";
import { cancelHold, placeHold } from "@/server/services/holds";
import { withUser, type ActionResult } from "./result";

export async function placeHoldAction(
  bookId: string,
): Promise<ActionResult<{ holdId: string; title: string; position: number }>> {
  const result = await withUser((user) => placeHold(user, bookId));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function cancelHoldAction(holdId: string): Promise<ActionResult<{ title: string }>> {
  const result = await withUser(async (user) => {
    const { title } = await cancelHold(user, holdId);
    return { title };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
