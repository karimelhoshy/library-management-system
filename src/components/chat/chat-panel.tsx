"use client";

import { ArrowUp, Loader2, MessageSquare, PanelRightClose, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "cn";
import { AvailabilityText } from "@/components/books/availability";
import { BookCover } from "@/components/books/book-cover";
import { Button } from "@/components/ui/button";
import { useChat } from "./chat-provider";
import { RichText } from "./rich-text";
import type { ChatMessage, ChatProposal, MiniBook } from "./types";

const SUGGESTIONS = ["What's due soon?", "Something like Piranesi", "Renew my loans", "Something short and funny I can borrow today"];

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function dayLabel(date: Date) {
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const day = sameDay
    ? "Today"
    : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${day}, ${timeFormat.format(date)}`;
}

function MiniBookCard({ book, children }: { book: MiniBook; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <Link
        href={`/books/${book.id}`}
        className="flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <BookCover title={book.title} coverUrl={book.coverUrl} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-foreground hover:text-accent-foreground">
            {book.title}
          </span>
          <span className="block truncate text-[13px] text-ink-2">{book.authors.join(", ")}</span>
          <AvailabilityText tone={book.tone} className="mt-1 text-xs">
            {book.statusText}
          </AvailabilityText>
        </span>
      </Link>
      {children}
    </div>
  );
}

const PROPOSAL_LABEL: Record<ChatProposal["kind"], string> = {
  place_hold: "Place hold",
  borrow_book: "Borrow",
  renew_loan: "Renew",
};

function ProposalCard({
  messageId,
  proposal,
  book,
}: {
  messageId: string;
  proposal: ChatProposal;
  book?: MiniBook;
}) {
  const { resolveProposal } = useChat();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<"confirm" | "dismiss" | null>(null);
  const decide = (decision: "confirm" | "dismiss") => {
    setChoice(decision);
    startTransition(() => resolveProposal(messageId, proposal.id, decision));
  };

  const body = (
    <div className="mt-3">
      <p className="text-sm text-ink-2">{proposal.detail}</p>
      {proposal.status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => decide("confirm")} disabled={pending}>
            {pending && choice === "confirm" && <Loader2 className="animate-spin" />}
            {PROPOSAL_LABEL[proposal.kind]}
          </Button>
          <Button variant="outline" onClick={() => decide("dismiss")} disabled={pending}>
            Not now
          </Button>
        </div>
      ) : (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-xl px-3 py-2 text-sm font-semibold",
            proposal.status === "confirmed" && "bg-success-bg text-success",
            proposal.status === "dismissed" && "bg-muted text-ink-2",
            proposal.status === "failed" && "bg-destructive-bg text-destructive",
          )}
        >
          {proposal.resultMessage ??
            (proposal.status === "dismissed" ? "No problem, I left it." : "Done.")}
        </p>
      )}
    </div>
  );

  if (book) return <MiniBookCard book={book}>{body}</MiniBookCard>;
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="text-[15px] font-bold">{proposal.title}</p>
      {body}
    </div>
  );
}

function AssistantAvatar() {
  return (
    <span aria-hidden className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-primary">
      <Sparkles className="size-3.5" />
    </span>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white">
          {message.text}
        </p>
      </div>
    );
  }
  const proposalBookIds = new Set(message.proposals?.map((p) => p.bookId));
  const books = message.books?.filter((b) => !proposalBookIds.has(b.id)) ?? [];
  return (
    <div className="flex gap-2.5">
      <AssistantAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {(message.text || message.status) && (
          <div
            className={cn(
              "rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed text-foreground",
              message.error && "border-destructive/30 bg-destructive-bg text-destructive",
            )}
          >
            {message.text ? (
              <RichText text={message.text} />
            ) : (
              <span className="inline-flex items-center gap-2 text-ink-3">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {message.status}
              </span>
            )}
            {message.text && message.status && (
              <span className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                {message.status}
              </span>
            )}
          </div>
        )}
        {books.map((book) => (
          <MiniBookCard key={book.id} book={book} />
        ))}
        {message.proposals?.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            messageId={message.id}
            proposal={proposal}
            book={message.books?.find((b) => b.id === proposal.bookId)}
          />
        ))}
      </div>
    </div>
  );
}

export function ChatPanel({
  variant,
  userName,
}: {
  variant: "column" | "page";
  userName: string | null;
}) {
  const chat = useChat();
  const { ensureLoaded, registerComposer } = chat;
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessage = chat.messages.at(-1);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.messages.length, lastMessage?.text, lastMessage?.proposals?.length, lastMessage?.books?.length]);

  const submit = (text: string) => {
    if (!text.trim() || chat.sending) return;
    setDraft("");
    void chat.send(text);
  };

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

      <footer className="border-t border-border bg-surface px-4 pt-3 pb-4">
        {chat.aiEnabled && (
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.slice(0, chat.messages.length ? 3 : 4).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => submit(suggestion)}
                disabled={chat.sending}
                className="min-h-9 rounded-full border border-accent-border/60 bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-accent-foreground transition-colors hover:bg-accent-border/60 disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
          className="flex items-end gap-2 rounded-2xl border-2 border-primary/70 bg-surface p-2 pl-3.5 shadow-[0_0_0_4px_rgba(79,70,229,0.08)] focus-within:border-primary focus-within:shadow-[0_0_0_4px_rgba(79,70,229,0.15)]"
        >
          <label htmlFor={`chat-input-${variant}`} className="sr-only">
            Message the Librarian
          </label>
          <textarea
            id={`chat-input-${variant}`}
            ref={variant === "column" || variant === "page" ? registerComposer : undefined}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit(draft);
              }
            }}
            disabled={!chat.aiEnabled}
            placeholder={chat.aiEnabled ? "Message the Librarian…" : "AI is turned off"}
            maxLength={1000}
            className="min-h-12 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-none disabled:cursor-not-allowed"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!chat.aiEnabled || chat.sending || !draft.trim()}
            aria-label="Send message"
            className="rounded-xl"
          >
            {chat.sending ? <Loader2 className="animate-spin" /> : <ArrowUp className="size-5" />}
          </Button>
        </form>
      </footer>
    </section>
  );
}
