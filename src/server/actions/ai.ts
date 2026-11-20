"use server";

import { revalidatePath } from "next/cache";
import type { ChatProposal } from "@/components/chat/types";
import { resolveProposal } from "@/server/services/chat";
import { withUser, type ActionResult } from "./result";

/** Runs (or dismisses) an action the librarian proposed in the chat. */
export async function resolveProposalAction(
  messageId: string,
  proposalId: string,
  decision: "confirm" | "dismiss",
): Promise<ActionResult<{ proposal: ChatProposal }>> {
  const result = await withUser(async (user) => ({
    proposal: await resolveProposal(user, messageId, proposalId, decision === "confirm" ? "confirm" : "dismiss"),
  }));
  if (result.ok && result.data.proposal.status === "confirmed") revalidatePath("/", "layout");
  return result;
}
