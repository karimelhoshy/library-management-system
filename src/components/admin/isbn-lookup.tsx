"use client";

import { BookCheck, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BookDraft } from "@/lib/open-library";
import { addCopiesAction, lookupIsbnAction, type IsbnLookup } from "@/server/actions/books";
import { IsbnScanButton } from "./isbn-scanner";

/**
 * "Start with an ISBN": type or scan one, and Open Library fills in the form.
 * If the library already owns the book, offers "Add a copy" instead.
 */
export function IsbnLookupPanel({
  initialIsbn,
  onFound,
  onNotFound,
}: {
  initialIsbn: string;
  onFound: (draft: BookDraft) => void;
  onNotFound: (isbn: string) => void;
}) {
  const [query, setQuery] = useState(initialIsbn);
  const [lookup, setLookup] = useState<IsbnLookup | null>(null);
  const [looking, startLookup] = useTransition();
  const [adding, startAdd] = useTransition();

  const runLookup = (raw: string) => {
    const isbn = raw.trim();
    if (!isbn) return;
    setQuery(isbn);
    startLookup(async () => {
      const result = await lookupIsbnAction(isbn);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const found = result.data;
      setLookup(found);
      if (found.status === "found") {
        onFound(found.draft);
        toast.success("Found it on Open Library", { description: "Check the details, then save." });
      } else if (found.status === "not_found") {
        onNotFound(found.isbn);
      }
    });
  };

  const addCopy = (owned: Extract<IsbnLookup, { status: "owned" }>) =>
    startAdd(async () => {
      const result = await addCopiesAction(owned.bookId, 1);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Added a copy of “${result.data.title}”`, { description: `${result.data.totalCopies} copies now` });
      setLookup({ ...owned, totalCopies: result.data.totalCopies });
    });

  return (
    <section className="rounded-2xl border border-border bg-surface p-5" aria-labelledby="isbn-heading">
      <h2 id="isbn-heading" className="text-[17px] font-bold">
        Start with an ISBN
      </h2>
      <p className="mt-0.5 text-sm text-ink-2">Type it or scan the barcode. Open Library fills in the rest.</p>
      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          runLookup(query);
        }}
      >
        <label htmlFor="isbn-lookup" className="sr-only">
          ISBN
        </label>
        <Input
          id="isbn-lookup"
          inputMode="numeric"
          placeholder="e.g. 9780441172719"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-12 min-w-52 flex-1 text-base"
        />
        <Button type="submit" className="h-12" disabled={looking || !query.trim()}>
          {looking ? <Loader2 className="animate-spin" /> : <Search />} Look up
        </Button>
        <IsbnScanButton onDetected={runLookup} />
      </form>

      {lookup?.status === "owned" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent-border bg-accent px-4 py-3 text-accent-foreground">
          <BookCheck className="size-5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1 text-[15px]">
            <strong>{lookup.title}</strong> is already in the catalog ({lookup.totalCopies}{" "}
            {lookup.totalCopies === 1 ? "copy" : "copies"}).
          </p>
          <Button size="sm" disabled={adding} onClick={() => addCopy(lookup)}>
            {adding ? <Loader2 className="animate-spin" /> : <Plus />} Add a copy
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/books/${lookup.bookId}`}>View</Link>
          </Button>
        </div>
      )}
      {lookup?.status === "not_found" && (
        <p className="mt-4 rounded-xl bg-warning-bg px-4 py-3 text-[15px] text-warning">
          Open Library doesn&apos;t know this ISBN. Fill in the details below by hand.
        </p>
      )}
    </section>
  );
}
