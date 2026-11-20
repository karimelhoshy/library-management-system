import Link from "next/link";
import type { BookCard as BookCardData } from "@/server/services/catalog";
import { cardStatus } from "@/server/services/rules";
import { AvailabilityText } from "./availability";
import { BookCover } from "./book-cover";

export function BookCard({ book, priority = false }: { book: BookCardData; priority?: boolean }) {
  const status = cardStatus(book);
  const byline = [book.authors.join(", "), book.year].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/books/${book.id}`}
      className="group flex gap-4 rounded-2xl border border-border bg-surface p-3.5 transition-[border-color,box-shadow] hover:border-accent-border hover:shadow-[0_2px_12px_rgba(28,25,23,0.06)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <BookCover title={book.title} coverUrl={book.coverUrl} priority={priority} />
      <div className="flex min-w-0 flex-1 flex-col py-0.5">
        <h3 className="line-clamp-2 text-[17px] leading-snug font-bold tracking-[-0.015em] text-foreground group-hover:text-accent-foreground">
          {book.title}
        </h3>
        <p className="mt-0.5 truncate text-[15px] text-ink-2">{byline}</p>
        {book.summary && <p className="mt-1 line-clamp-2 text-sm leading-snug text-ink-3">{book.summary}</p>}
        <div className="mt-auto pt-2">
          <AvailabilityText tone={status.tone}>{status.text}</AvailabilityText>
        </div>
      </div>
    </Link>
  );
}

export function BookCardSkeleton() {
  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-surface p-3.5">
      <div className="h-[108px] w-[72px] animate-pulse rounded-[6px] bg-muted" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="mt-auto h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
