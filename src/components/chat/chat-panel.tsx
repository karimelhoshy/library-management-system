"use client";

import { MessageSquare, PanelRightClose, Plus, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "./chat-composer";
import { useChat } from "./chat-provider";
import { AssistantAvatar, MessageView } from "./message-view";

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function dayLabel(date: Date) {
  const today = new Date();
  const day =
    date.toDateString() === today.toDateString()
      ? "Today"
      : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day}, ${timeFormat.format(date)}`;
}

/** Ask the Librarian: the right-hand column on desktop, and the full /ask page on phones. */
export function ChatPanel({
  variant,
  userName,
}: {
  variant: "column" | "page";
  userName: string | null;
}) {
  const chat = useChat();
  const { ensureLoaded } = chat;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessage = chat.messages.at(-1);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  // Follow the conversation as replies stream in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.messages.length, lastMessage?.text, lastMessage?.proposals?.length, lastMessage?.books?.length]);

  const firstName = userName?.split(" ")[0];
  const firstAt = chat.messages[0]?.createdAt;

  return (
    <section aria-label="Ask the Librarian" className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-white">
          <MessageSquare className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg leading-tight font-extrabold tracking-[-0.02em]">Ask the Librarian</h2>
          <p className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-snug text-ink-2">
            <span
              aria-hidden
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", chat.aiEnabled ? "bg-success-dot" : "bg-ink-3")}
            />
            {chat.aiEnabled ? "AI assistant · can search, hold and borrow for you" : "AI assistant · currently off"}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={chat.newChat}
            disabled={!chat.aiEnabled || chat.sending}
            aria-label="New chat"
            title="New chat"
          >
            <Plus />
          </Button>
          {variant === "column" && (
            <Button variant="ghost" size="icon-sm" onClick={chat.closeColumn} aria-label="Hide chat" title="Hide chat">
              <PanelRightClose />
            </Button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-surface-sunken px-4 py-5" aria-live="polite">
        {!chat.aiEnabled ? (
          <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-border bg-surface p-5 text-center">
            <Sparkles className="mx-auto size-6 text-primary" aria-hidden />
            <p className="mt-3 font-bold">The AI librarian is off</p>
            <p className="mt-1 text-sm text-ink-2">
              This library hasn&apos;t connected an AI key yet. Everything else works as usual: search, borrow,
              return and holds.
            </p>
          </div>
        ) : chat.messages.length === 0 ? (
          <div className="flex gap-2.5">
            <AssistantAvatar />
            <div className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed">
              <p>
                Hi{firstName ? ` ${firstName}` : ""}! I can search the catalog, check what&apos;s on the shelf, place
                holds, borrow and renew for you. You&apos;ll always get to confirm before I change anything.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {firstAt && <p className="text-center text-[13px] text-ink-3">{dayLabel(new Date(firstAt))}</p>}
            {chat.messages.map((message) => (
              <MessageView key={message.id} message={message} />
            ))}
          </div>
        )}
      </div>

      <ChatComposer inputId={`chat-input-${variant}`} />
    </section>
  );
}
