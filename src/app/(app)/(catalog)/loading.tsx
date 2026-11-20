import { BookCardSkeleton } from "@/components/books/book-card";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 md:px-8 md:py-8" aria-busy="true" aria-label="Loading">
      <div className="h-[220px] animate-pulse rounded-3xl border border-border bg-surface" />
      <div className="mt-8 mb-4 h-7 w-48 animate-pulse rounded-lg bg-muted" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
