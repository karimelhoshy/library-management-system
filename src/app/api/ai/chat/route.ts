import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ChatStreamEvent } from "@/components/chat/types";
import { runLibrarian } from "@/server/ai/agent";
import { consumeAiQuota } from "@/server/ai/rate-limit";
import { can, DomainError } from "@/server/auth/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { isAiEnabled } from "@/server/env";
import { listThreadForApi, loadThread, saveMessage } from "@/server/services/chat";

export const maxDuration = 60;

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

/** The member's latest conversation. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Please sign in." }, 401);
  if (!can(user, "ai:chat")) return json({ error: "Not allowed." }, 403);
  return json(await listThreadForApi(user.id), 200);
}

const bodySchema = z.object({
  threadId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(1000),
});

/** Sends a message and streams the reply as newline-delimited JSON events. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Please sign in." }, 401);
  if (!can(user, "ai:chat")) return json({ error: "Not allowed." }, 403);
  if (!isAiEnabled()) return json({ error: "The AI librarian is turned off on this library." }, 503);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Please type a message (up to 1000 characters)." }, 400);

  try {
    await consumeAiQuota(user.id, "chat");
  } catch (error) {
    if (error instanceof DomainError) return json({ error: error.message }, error.status);
    throw error;
  }

  const threadId = parsed.data.threadId ?? randomUUID();
  const history = parsed.data.threadId ? (await loadThread(user.id, threadId, 12)) : [];
  const userMessageId = await saveMessage(user.id, threadId, "user", { text: parsed.data.message });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({ type: "thread", threadId, userMessageId });
      try {
        const agent = runLibrarian(user, history, parsed.data.message);
        let step = await agent.next();
        while (!step.done) {
          send(step.value);
          step = await agent.next();
        }
        const messageId = await saveMessage(user.id, threadId, "assistant", step.value.content);
        send({ type: "done", messageId });
      } catch (error) {
        console.error("[api/ai/chat] stream failed", error);
        send({ type: "error", message: "Something went wrong. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
