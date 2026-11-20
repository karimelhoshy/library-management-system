/** Shared types between the chat UI and the /api/ai/chat route. */

export type MiniBook = {
  id: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  statusText: string;
  tone: "available" | "onloan" | "ready" | "mine";
};

export type ChatProposal = {
  id: string;
  kind: "place_hold" | "borrow_book" | "renew_loan";
  bookId: string;
  loanId?: string;
  title: string;
  detail: string;
  status: "pending" | "confirmed" | "dismissed" | "failed";
  resultMessage?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  books?: MiniBook[];
  proposals?: ChatProposal[];
  error?: boolean;
  createdAt: string;
  /** Client-only: still streaming. */
  pending?: boolean;
  /** Client-only: what the agent is doing right now. */
  status?: string;
};

export type ChatStreamEvent =
  | { type: "thread"; threadId: string; userMessageId: string }
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "books"; books: MiniBook[] }
  | { type: "proposal"; proposal: ChatProposal }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

export type ChatThreadResponse = {
  threadId: string | null;
  messages: ChatMessage[];
};
