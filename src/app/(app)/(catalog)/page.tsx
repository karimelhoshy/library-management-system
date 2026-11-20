import { SearchX, Sparkles } from "lucide-react";
import Link from "next/link";
import { BookCard } from "@/components/books/book-card";
import { CatalogView } from "@/components/catalog/catalog-view";
import { SortMenu } from "@/components/catalog/sort-menu";
import { ReadyHoldNotice } from "@/components/loans/ready-hold-notice";
import { Button } from "@/components/ui/button";
import { parseCatalogQuery } from "@/lib/validation";
import { requireUser } from "@/server/auth/session";
import { isAiEnabled } from "@/server/env";
import { getCatalogFacets, searchCatalog, vibeSearch } from "@/server/services/catalog";
import { listMyHolds } from "@/server/services/holds";

export default async function CatalogPage({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const query = parseCatalogQuery(await searchParams);
  const aiEnabled = isAiEnabled();
  const [result, facets, holds] = await Promise.all([
    query.vibe && query.q ? vibeSearch(query, user.id) : searchCatalog(query, user.id),
    getCatalogFacets(),
    listMyHolds(user.id),
  ]);

  const heading =
    result.mode === "vibe"
      ? `${result.total} ${result.total === 1 ? "match" : "matches"} by meaning`
      : query.q
        ? `${result.total} ${result.total === 1 ? "result" : "results"} for “${query.q}”`
        : `${result.total} ${result.total === 1 ? "book" : "books"}`;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 md:px-8 md:py-8">
      <ReadyHoldNotice holds={holds} />
      <CatalogView aiEnabled={aiEnabled} languages={facets.languages}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em]" aria-live="polite">
            {heading}
          </h2>
          <SortMenu sort={query.sort} vibe={result.mode === "vibe"} />
        </div>
        {result.notice && (
          <p className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink-2">
            {result.notice}
          </p>
        )}
        {result.items.length > 0 ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {result.items.map((book, index) => (
              <li key={book.id} className="contents">
                <BookCard book={book} priority={index < 6} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-input bg-surface px-6 py-12 text-center">
            <SearchX className="mx-auto size-8 text-ink-3" aria-hidden />
            <p className="mt-3 text-lg font-bold">No books match that yet</p>
            <p className="mt-1 text-[15px] text-ink-2">
              Try fewer filters, a different spelling{aiEnabled ? ", or search by vibe" : ""}.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/">Clear search and filters</Link>
              </Button>
              {aiEnabled && query.q && !query.vibe && (
                <Button variant="secondary" asChild>
                  <Link href={`/?q=${encodeURIComponent(query.q)}&vibe=1`}>
                    <Sparkles aria-hidden /> Try “{query.q}” by vibe
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </CatalogView>
    </div>
  );
}
