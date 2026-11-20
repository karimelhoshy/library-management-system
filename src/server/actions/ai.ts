"use server";

import type { ChatProposal } from "@/components/chat/types";
import type { ActionResult } from "./result";

export async function resolveProposalAction(
  _messageId: string,
  _proposalId: string,
  _decision: "confirm" | "dismiss",
): Promise<ActionResult<{ proposal: ChatProposal }>> {
  return { ok: false, status: 501, error: "Not implemented yet." };
}
