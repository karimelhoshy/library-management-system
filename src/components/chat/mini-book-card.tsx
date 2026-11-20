import Link from "next/link";
import { AvailabilityText } from "@/components/books/availability";
import { BookCover } from "@/components/books/book-cover";
import type { MiniBook } from "@/lib/chat-types";

/** A book the librarian mentioned, linked to its page. `children` sits under it (e.g. a confirm card). */
export function MiniBookCard({ book, children }: { book: MiniBook; children?: React.ReactNode }) {
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
