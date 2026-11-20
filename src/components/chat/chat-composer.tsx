"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useChat } from "./chat-provider";

const SUGGESTIONS = ["What's due soon?", "Something like Piranesi", "Renew my loans", "Something short and funny I can borrow today"];

/** Suggestion chips and the message box. Enter sends; Shift+Enter adds a line. */
export function ChatComposer({ inputId }: { inputId: string }) {
  const chat = useChat();
  // Destructured so the lint rule doesn't treat the whole context as a ref.
  const { registerComposer } = chat;
  const [draft, setDraft] = useState("");

  const submit = (text: string) => {
    if (!text.trim() || chat.sending) return;
    setDraft("");
    void chat.send(text);
  };

  return (
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
        <label htmlFor={inputId} className="sr-only">
          Message the Librarian
        </label>
        <textarea
          id={inputId}
          ref={registerComposer}
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
  );
}
