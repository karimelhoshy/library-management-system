/**
 * The Ask-the-Librarian loop end to end against Postgres, with a scripted fake Gemini:
 * the model searches, proposes a hold, replies; the member confirms mid-reply; the hold exists.
 * Runs when TEST_DATABASE_URL is set.
 */
import type { Content } from "@google/genai";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChatStreamEvent } from "@/lib/chat-types";

const url = process.env.TEST_DATABASE_URL;

type Script = (contents: Content[]) => { text?: string; call?: { name: string; args: Record<string, unknown> } };
let script: Script[] = [];

vi.mock("@/server/ai/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/ai/client")>();
  return {
    ...original,
    getGenAI: () => ({
      models: {
        async *generateContentStream({ contents }: { contents: Content[] }) {
          const next = script.shift();
          if (!next) throw new Error("script exhausted");
          const turn = next(contents);
          const parts = turn.call
            ? [{ functionCall: { id: "call-1", name: turn.call.name, args: turn.call.args }, thoughtSignature: "sig" }]
            : [{ text: turn.text ?? "" }];
          yield { candidates: [{ content: { role: "model", parts } }] };
        },
        async embedContent() {
          throw new Error("no embeddings in tests");
        },
      },
    }),
  };
});

/** Pulls the first book_id out of the latest tool response the agent sent back. */
function lastBookId(contents: Content[]): string {
  const last = contents.at(-1)?.parts?.[0]?.functionResponse?.response as { result?: { books?: { book_id: string }[] } };
  return last?.result?.books?.[0]?.book_id ?? "";
}

describe.skipIf(!url)("Ask the Librarian (integration, fake model)", () => {
  let db: typeof import("@/server/db");
  let schema: typeof import("@/server/db/schema");

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.GEMINI_API_KEY = "test-key";
    db = await import("@/server/db");
    schema = await import("@/server/db/schema");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db.db, { migrationsFolder: "src/server/db/migrations" });
    for (const table of [schema.aiMessages, schema.aiUsage, schema.emailOutbox, schema.activityLog, schema.holds, schema.loans, schema.books, schema.users]) {
      await db.db.delete(table);
    }
    await db.db.insert(schema.users).values([
      { id: "it-maya", name: "Maya", email: "maya@example.com" },
      { id: "it-other", name: "Other", email: "other@example.com" },
    ]);
    const [book] = await db.db
      .insert(schema.books)
      .values({ title: "Project Hail Mary", authors: ["Andy Weir"], totalCopies: 1, genres: ["Science Fiction"] })
      .returning();
    await db.db.insert(schema.loans).values({
      bookId: book!.id,
      userId: "it-other",
      dueAt: new Date(Date.now() + 5 * 86_400_000),
    });
  });

  afterAll(async () => {
    delete process.env.GEMINI_API_KEY;
    await db?.pool.end();
  });

  it("saves a proposal as it's made, so it can be confirmed before the reply finishes", async () => {
    const { replyAndSave } = await import("@/server/ai/turn");
    const { resolveProposal } = await import("@/server/services/chat");
    const user = { id: "it-maya", name: "Maya", email: "maya@example.com", image: null, role: "member" as const, isDemo: false };

    script = [
      () => ({ call: { name: "search_books", args: { query: "project hail mary" } } }),
      (contents) => ({ call: { name: "place_hold", args: { book_id: lastBookId(contents) } } }),
      () => ({ text: "All copies of **Project Hail Mary** are out. Tap Place hold to join the queue." }),
    ];

    const events: ChatStreamEvent[] = [];
    let messageId = "";
    let confirmed: Awaited<ReturnType<typeof resolveProposal>> | undefined;
    for await (const event of replyAndSave(user, crypto.randomUUID(), [], "Hold the next free copy of Project Hail Mary for me")) {
      events.push(event);
      if (event.type === "thread") messageId = event.messageId;
      if (event.type === "proposal") {
        // Nothing has happened yet; the member presses the card while the reply is still coming.
        expect(await db.db.select().from(schema.holds)).toHaveLength(0);
        confirmed = await resolveProposal(user, messageId, event.proposal.id, "confirm");
      }
    }

    expect(events.filter((e) => e.type === "status").length).toBe(2);
    expect(events.at(-1)?.type).toBe("done");
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.resultMessage).toMatch(/first in line/);
    expect(await db.db.select().from(schema.holds)).toHaveLength(1);

    // The finished reply is saved without undoing the confirmation.
    const [row] = await db.db.select().from(schema.aiMessages).where(eq(schema.aiMessages.id, messageId));
    expect(row?.content.text).toContain("Project Hail Mary");
    expect(row?.content.bookIds).toHaveLength(1);
    expect(row?.content.proposals?.map((p) => p.status)).toEqual(["confirmed"]);

    // Confirming twice is a no-op.
    const again = await resolveProposal(user, messageId, confirmed!.id, "confirm");
    expect(again.status).toBe("confirmed");
    expect(await db.db.select().from(schema.holds)).toHaveLength(1);

    // An id that was never saved is a clean "not available", not a database error.
    await expect(resolveProposal(user, "assistant-1-2", confirmed!.id, "confirm")).rejects.toThrow(/isn't available/);
  });

  it("refuses to propose borrowing when no copy is free", async () => {
    const { runLibrarian } = await import("@/server/ai/agent");
    const user = { id: "it-other", name: "Other", email: "other@example.com", image: null, role: "member" as const, isDemo: false };
    let toolResult: unknown;
    script = [
      () => ({ call: { name: "search_books", args: { query: "hail mary" } } }),
      (contents) => ({ call: { name: "borrow_book", args: { book_id: lastBookId(contents) } } }),
      (contents) => {
        toolResult = contents.at(-1)?.parts?.[0]?.functionResponse?.response;
        return { text: "You already have it." };
      },
    ];
    const agent = runLibrarian(user, [], "borrow project hail mary");
    let step = await agent.next();
    while (!step.done) step = await agent.next();
    expect(step.value.content.proposals).toHaveLength(0);
    expect(JSON.stringify(toolResult)).toMatch(/already has this book/);
  });
});
