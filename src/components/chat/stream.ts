import type { ChatMessage, ChatStreamEvent } from "@/lib/chat-types";

/**
 * Posts a message to /api/ai/chat and yields the reply as it streams in.
 * The route sends newline-delimited JSON: one ChatStreamEvent per line.
 */
export async function* streamChat(threadId: string | null, message: string): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, message }),
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "The librarian couldn't answer just now. Please try again.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as ChatStreamEvent;
    }
    if (done) return;
  }
}

/** Applies one streamed event to the assistant message being written. */
export function applyStreamEvent(message: ChatMessage, event: ChatStreamEvent): ChatMessage {
  switch (event.type) {
    case "status":
      return { ...message, status: event.text };
    case "text":
      return { ...message, text: message.text + event.delta, status: undefined };
    case "books":
      return { ...message, books: event.books };
    case "proposal":
      return { ...message, proposals: [...(message.proposals ?? []), event.proposal] };
    case "error":
      return { ...message, text: message.text || event.message, error: true };
    default:
      return message;
  }
}
