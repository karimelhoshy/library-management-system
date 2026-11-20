"use server";

import { revalidatePath } from "next/cache";
import { borrowBook, renewLoan, returnLoan, undoBorrow, undoReturn } from "@/server/services/loans";
import { withUser, type ActionResult } from "./result";

function refresh() {
  revalidatePath("/", "layout");
}

export async function borrowAction(
  bookId: string,
  memberId?: string,
): Promise<ActionResult<{ loanId: string; title: string; dueAt: string }>> {
  const result = await withUser(async (user) => {
    const loan = await borrowBook(user, { bookId, memberId });
    return { loanId: loan.loanId, title: loan.title, dueAt: loan.dueAt.toISOString() };
  });
  if (result.ok) refresh();
  return result;
}

export async function returnAction(loanId: string): Promise<ActionResult<{ title: string; holdReady: boolean }>> {
  const result = await withUser(async (user) => {
    const done = await returnLoan(user, loanId);
    return { title: done.title, holdReady: done.promoted.length > 0 };
  });
  if (result.ok) refresh();
  return result;
}

export async function renewAction(loanId: string): Promise<ActionResult<{ title: string; dueAt: string }>> {
  const result = await withUser(async (user) => {
    const renewed = await renewLoan(user, loanId);
    return { title: renewed.title, dueAt: renewed.dueAt.toISOString() };
  });
  if (result.ok) refresh();
  return result;
}

export async function undoBorrowAction(loanId: string): Promise<ActionResult> {
  const result = await withUser(async (user) => {
    await undoBorrow(user, loanId);
    return null;
  });
  if (result.ok) refresh();
  return result;
}

export async function undoReturnAction(loanId: string): Promise<ActionResult> {
  const result = await withUser(async (user) => {
    await undoReturn(user, loanId);
    return null;
  });
  if (result.ok) refresh();
  return result;
}
