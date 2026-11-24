import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ChatStreamEvent } from "@/lib/chat-types";
import { consumeAiQuota } from "@/server/ai/rate-limit";
import { replyAndSave } from "@/server/ai/turn";
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
  await saveMessage(user.id, threadId, "user", { text: parsed.data.message });

  const encoder = new TextEncoder();
  // If the member leaves mid-reply (closes the tab, switches account), the turn still
  // finishes and is saved; there's just nobody to stream it to.
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        for await (const event of replyAndSave(user, threadId, history, parsed.data.message)) send(event);
      } catch (error) {
        console.error("[api/ai/chat] stream failed", error);
        send({ type: "error", message: "Something went wrong. Please try again." });
      } finally {
        if (open) controller.close();
      }
    },
    cancel() {
      open = false;
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
