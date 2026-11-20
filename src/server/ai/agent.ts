/**
 * Ask-the-Librarian agent: Gemini function calling in a loop of at most 5 steps,
 * streaming text to the client as it arrives. Write actions come back as proposals
 * that the member confirms in the UI (see resolveProposalAction).
 */
import { ApiError, ThinkingLevel, type Content, type FunctionCall, type GenerateContentConfig, type Part } from "@google/genai";
import type { ChatStreamEvent, MiniBook } from "@/components/chat/types";
import { APP_NAME, HOLD_READY_DAYS, LOAN_DAYS } from "@/lib/config";
import type { SessionUser } from "@/server/auth/session";
import type { AiMessageContent, AiProposal } from "@/server/db/schema";
import { geminiModel } from "@/server/env";
import type { BookCard } from "@/server/services/catalog";
import { AiUnavailableError, friendlyAiError, getGenAI } from "./client";
import { runTool, TOOL_DECLARATIONS, toMiniBook, toolStatus, type ToolContext } from "./tools";

const MAX_STEPS = 5;

export type HistoryMessage = { role: "user" | "assistant"; content: AiMessageContent };

function systemPrompt(user: SessionUser): string {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `You are the librarian at ${APP_NAME}, a friendly public library. You are chatting with ${user.name ?? "a member"}. Today is ${today}.

How you work:
- Always use tools to look things up. Never invent books, availability or dates. Only recommend books you found with a tool, and use their titles exactly as the catalog has them.
- For moods, themes or "something like X", use semantic_search. For titles, authors or genres, use search_books. Use check_availability before promising a copy.
- borrow_book, place_hold and renew_loan only put a confirmation card in front of the member. After calling one, say in a few words what the card will do and that they need to confirm. Never claim it is done.
- If a copy is available, offer to borrow it. If every copy is out, give the next due-back date and offer a hold.
- Rules: loans last ${LOAN_DAYS} days; a loan can be renewed once if nobody is waiting; a ready hold is kept for ${HOLD_READY_DAYS} days.
- Keep replies short and warm: one to three sentences, and at most three book suggestions with a few words on why. Use **bold** only for book titles. No headings, no tables.
- Never share information about other members. Politely decline requests that have nothing to do with books or the library.`;
}

/** Previous turns as plain text (tool calls aren't replayed; their outcomes are summarised). */
function historyToContents(history: HistoryMessage[]): Content[] {
  return history
    .filter((message) => message.content.text || message.content.proposals?.length)
    .map((message) => {
      let text = message.content.text;
      for (const proposal of message.content.proposals ?? []) {
        text += `\n[Offered to ${proposal.kind.replace("_", " ")} "${proposal.title}": ${proposal.status}${
          proposal.resultMessage ? ` (${proposal.resultMessage})` : ""
        }]`;
      }
      return { role: message.role === "assistant" ? "model" : "user", parts: [{ text: text.trim() || "…" }] };
    });
}

/** Which books to show as cards: ones named in the reply, plus any with a proposal. */
function pickBooks(text: string, seen: Map<string, BookCard>, proposals: AiProposal[]): BookCard[] {
  const lower = text.toLowerCase();
  const proposalIds = new Set(proposals.map((p) => p.bookId));
  const named = [...seen.values()]
    .filter((book) => proposalIds.has(book.id) || lower.includes(book.title.toLowerCase()))
    .sort((a, b) => {
      const ai = proposalIds.has(a.id) ? -1 : lower.indexOf(a.title.toLowerCase());
      const bi = proposalIds.has(b.id) ? -1 : lower.indexOf(b.title.toLowerCase());
      return ai - bi;
    });
  return named.slice(0, 4);
}

async function* streamStep(contents: Content[], config: GenerateContentConfig) {
  const ai = getGenAI();
  if (!ai) throw new AiUnavailableError();
  try {
    return yield* await ai.models.generateContentStream({ model: geminiModel(), contents, config });
  } catch (error) {
    // Some models reject a thinking level; retry once with the model's default.
    if (error instanceof ApiError && error.status === 400 && config.thinkingConfig) {
      const { thinkingConfig: _ignored, ...rest } = config;
      return yield* await ai.models.generateContentStream({ model: geminiModel(), contents, config: rest });
    }
    throw error;
  }
}

export type AgentResult = { content: AiMessageContent; books: MiniBook[] };

/**
 * Runs one turn. Yields stream events; returns the final assistant message to store.
 */
export async function* runLibrarian(
  user: SessionUser,
  history: HistoryMessage[],
  message: string,
): AsyncGenerator<ChatStreamEvent, AgentResult> {
  const ctx: ToolContext = { user, seenBooks: new Map(), proposals: [] };
  const contents: Content[] = [...historyToContents(history), { role: "user", parts: [{ text: message }] }];
  const config: GenerateContentConfig = {
    systemInstruction: systemPrompt(user),
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    temperature: 0.4,
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  };

  let text = "";
  let shownBooks: MiniBook[] = [];
  const emitBooks = (): ChatStreamEvent | null => {
    const books = pickBooks(text, ctx.seenBooks, ctx.proposals).map(toMiniBook);
    if (books.map((b) => b.id).join() === shownBooks.map((b) => b.id).join()) return null;
    shownBooks = books;
    return { type: "books", books };
  };

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const parts: Part[] = [];
      const calls: FunctionCall[] = [];
      for await (const chunk of streamStep(contents, config)) {
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          // Keep every part (including thought signatures) to send back with tool results.
          parts.push(part);
          if (part.functionCall) calls.push(part.functionCall);
          else if (part.text && !part.thought) {
            // Separate text from different steps with a paragraph break.
            const delta = text && parts.filter((p) => p.text && !p.thought).length === 1 ? `\n\n${part.text}` : part.text;
            text += delta;
            yield { type: "text", delta };
          }
        }
      }
      contents.push({ role: "model", parts });
      if (calls.length === 0) break;

      const responses: Part[] = [];
      for (const call of calls) {
        yield { type: "status", text: toolStatus(call.name ?? "") };
        const before = ctx.proposals.length;
        const result = await runTool(call.name ?? "", call.args, ctx);
        responses.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
        for (const proposal of ctx.proposals.slice(before)) {
          const books = emitBooks();
          if (books) yield books;
          yield { type: "proposal", proposal };
        }
      }
      contents.push({ role: "user", parts: responses });

      if (step === MAX_STEPS - 1 && !text) {
        text = "I looked through a lot but couldn't settle on an answer. Could you tell me a bit more?";
        yield { type: "text", delta: text };
      }
    }
  } catch (error) {
    console.error("[ai] librarian failed", error);
    const message = friendlyAiError(error);
    yield { type: "error", message };
    return { content: { text: text || message, error: true, proposals: ctx.proposals }, books: shownBooks };
  }

  if (!text.trim()) {
    text = ctx.proposals.length ? "Here you go. Confirm on the card below." : "Sorry, I didn't catch that. Could you rephrase?";
    yield { type: "text", delta: text };
  }
  const books = emitBooks();
  if (books) yield books;

  return {
    content: { text, bookIds: shownBooks.map((b) => b.id), proposals: ctx.proposals },
    books: shownBooks,
  };
}
