/**
 * One chat turn, saved as it happens. The reply's row is created before the model starts
 * and each proposal is stored the moment it's made, so a confirm card works while the reply
 * is still streaming. The finished text is merged in at the end without touching proposals,
 * which the member may already have confirmed.
 */
import type { ChatStreamEvent } from "@/lib/chat-types";
import type { SessionUser } from "@/server/auth/session";
import { addProposal, finishMessage, saveMessage } from "@/server/services/chat";
import { runLibrarian, type HistoryMessage } from "./agent";

export async function* replyAndSave(
  user: SessionUser,
  threadId: string,
  history: HistoryMessage[],
  message: string,
): AsyncGenerator<ChatStreamEvent> {
  const messageId = await saveMessage(user.id, threadId, "assistant", { text: "" });
  yield { type: "thread", threadId, messageId };

  const agent = runLibrarian(user, history, message);
  let step = await agent.next();
  while (!step.done) {
    if (step.value.type === "proposal") await addProposal(messageId, step.value.proposal);
    yield step.value;
    step = await agent.next();
  }
  const { proposals: _alreadySaved, ...reply } = step.value.content;
  await finishMessage(messageId, reply);
  yield { type: "done" };
}
