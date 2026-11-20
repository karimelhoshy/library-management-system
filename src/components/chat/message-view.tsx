import { Loader2, Sparkles } from "lucide-react";
import { cn } from "cn";
import type { ChatMessage } from "@/lib/chat-types";
import { MiniBookCard } from "./mini-book-card";
import { ProposalCard } from "./proposal-card";
import { RichText } from "./rich-text";

export function AssistantAvatar() {
  return (
    <span aria-hidden className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-primary">
      <Sparkles className="size-3.5" />
    </span>
  );
}

/** One chat message: the text, then any book cards, then any confirm cards. */
export function MessageView({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white">
          {message.text}
        </p>
      </div>
    );
  }
  // A book with a confirm card is shown inside that card, not twice.
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
