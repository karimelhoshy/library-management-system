"use client";

import { BookCheck, Loader2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { BookCover } from "@/components/books/book-cover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRIMARY_GENRES } from "@/lib/config";
import type { BookDraft } from "@/lib/open-library";
import { bookInputSchema } from "@/lib/validation";
import {
  addCopiesAction,
  createBookAction,
  lookupIsbnAction,
  updateBookAction,
  type IsbnLookup,
} from "@/server/actions/books";
import { IsbnScanButton } from "./isbn-scanner";

export type BookFormValues = {
  title: string;
  authors: string;
  isbn: string;
  coverUrl: string;
  summary: string;
  description: string;
  primaryGenre: string;
  tags: string;
  publisher: string;
  year: string;
  pages: string;
  language: string;
  totalCopies: string;
  shelfLocation: string;
};

export const EMPTY_BOOK: BookFormValues = {
  title: "",
  authors: "",
  isbn: "",
  coverUrl: "",
  summary: "",
  description: "",
  primaryGenre: "",
  tags: "",
  publisher: "",
  year: "",
  pages: "",
  language: "English",
  totalCopies: "1",
  shelfLocation: "",
};

function splitGenres(genres: string[]) {
  const primary = genres.find((g) => (PRIMARY_GENRES as readonly string[]).includes(g)) ?? "";
  return { primaryGenre: primary, tags: genres.filter((g) => g !== primary).join(", ") };
}

export function draftToValues(draft: BookDraft, current: BookFormValues): BookFormValues {
  return {
    ...current,
    title: draft.title,
    authors: draft.authors.join(", "),
    isbn: draft.isbn ?? current.isbn,
    coverUrl: draft.coverUrl ?? "",
    description: draft.description ?? "",
    ...splitGenres(draft.genres),
    publisher: draft.publisher ?? "",
    year: draft.year ? String(draft.year) : "",
    pages: draft.pages ? String(draft.pages) : "",
    language: draft.language || "English",
  };
}

export function bookToValues(book: {
  title: string;
  authors: string[];
  isbn: string | null;
  coverUrl: string | null;
  summary: string | null;
  description: string | null;
  genres: string[];
  publisher: string | null;
  year: number | null;
  pages: number | null;
  language: string;
  totalCopies: number;
  shelfLocation: string | null;
}): BookFormValues {
  return {
    title: book.title,
    authors: book.authors.join(", "),
    isbn: book.isbn ?? "",
    coverUrl: book.coverUrl ?? "",
    summary: book.summary ?? "",
    description: book.description ?? "",
    ...splitGenres(book.genres),
    publisher: book.publisher ?? "",
    year: book.year ? String(book.year) : "",
    pages: book.pages ? String(book.pages) : "",
    language: book.language,
    totalCopies: String(book.totalCopies),
    shelfLocation: book.shelfLocation ?? "",
  };
}

function toInput(values: BookFormValues) {
  return {
    title: values.title,
    authors: values.authors,
    isbn: values.isbn || null,
    coverUrl: values.coverUrl || null,
    summary: values.summary || null,
    description: values.description || null,
    genres: [values.primaryGenre, ...values.tags.split(",")].filter((g) => g.trim()),
    publisher: values.publisher || null,
    year: values.year || null,
    pages: values.pages || null,
    language: values.language || "English",
    totalCopies: values.totalCopies || "1",
    shelfLocation: values.shelfLocation || null,
  };
}

function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-ink-3">{hint}</p>
      )}
    </div>
  );
}

export function BookForm({
  mode,
  bookId,
  initial = EMPTY_BOOK,
}: {
  mode: "create" | "edit";
  bookId?: string;
  initial?: BookFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<BookFormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof BookFormValues, string>>>({});
  const [isbnQuery, setIsbnQuery] = useState(initial.isbn);
  const [lookup, setLookup] = useState<IsbnLookup | null>(null);
  const [looking, startLookup] = useTransition();
  const [saving, startSave] = useTransition();
  const [adding, startAdd] = useTransition();

  const set = (key: keyof BookFormValues) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  const runLookup = (raw: string) => {
    const isbn = raw.trim();
    if (!isbn) return;
    setIsbnQuery(isbn);
    startLookup(async () => {
      const result = await lookupIsbnAction(isbn);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setLookup(result.data);
      if (result.data.status === "found") {
        setValues((v) => draftToValues((result.data as { draft: BookDraft }).draft, v));
        setErrors({});
        toast.success("Found it on Open Library", { description: "Check the details, then save." });
      } else if (result.data.status === "not_found") {
        setValues((v) => ({ ...v, isbn: result.data.status === "not_found" ? result.data.isbn : v.isbn }));
      }
    });
  };

  const save = () => {
    const input = toInput(values);
    const parsed = bookInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof BookFormValues;
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    startSave(async () => {
      const result =
        mode === "edit" && bookId ? await updateBookAction(bookId, input) : await createBookAction(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(mode === "edit" ? `Saved “${result.data.title}”` : `Added “${result.data.title}” to the catalog`);
      router.push(`/books/${result.data.id}`);
    });
  };

  const fieldProps = (key: keyof BookFormValues) => ({
    id: `book-${key}`,
    value: values[key],
    onChange: set(key),
    "aria-invalid": Boolean(errors[key]) || undefined,
    "aria-describedby": errors[key] ? `book-${key}-error` : undefined,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="flex min-w-0 flex-col gap-6">
        {mode === "create" && (
          <section className="rounded-2xl border border-border bg-surface p-5" aria-labelledby="isbn-heading">
            <h2 id="isbn-heading" className="text-[17px] font-bold">
              Start with an ISBN
            </h2>
            <p className="mt-0.5 text-sm text-ink-2">Type it or scan the barcode. Open Library fills in the rest.</p>
            <form
              className="mt-4 flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                runLookup(isbnQuery);
              }}
            >
              <label htmlFor="isbn-lookup" className="sr-only">
                ISBN
              </label>
              <Input
                id="isbn-lookup"
                inputMode="numeric"
                placeholder="e.g. 9780441172719"
                value={isbnQuery}
                onChange={(e) => setIsbnQuery(e.target.value)}
                className="h-12 min-w-52 flex-1 text-base"
              />
              <Button type="submit" className="h-12" disabled={looking || !isbnQuery.trim()}>
                {looking ? <Loader2 className="animate-spin" /> : <Search />} Look up
              </Button>
              <IsbnScanButton onDetected={(isbn) => runLookup(isbn)} />
            </form>

            {lookup?.status === "owned" && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent-border bg-accent px-4 py-3 text-accent-foreground">
                <BookCheck className="size-5 shrink-0" aria-hidden />
                <p className="min-w-0 flex-1 text-[15px]">
                  <strong>{lookup.title}</strong> is already in the catalog ({lookup.totalCopies}{" "}
                  {lookup.totalCopies === 1 ? "copy" : "copies"}).
                </p>
                <Button
                  size="sm"
                  disabled={adding}
                  onClick={() =>
                    startAdd(async () => {
                      const result = await addCopiesAction(lookup.bookId, 1);
                      if (result.ok) {
                        toast.success(`Added a copy of “${result.data.title}”`, {
                          description: `${result.data.totalCopies} copies now`,
                        });
                        setLookup({ ...lookup, totalCopies: result.data.totalCopies });
                      } else toast.error(result.error);
                    })
                  }
                >
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
        )}

        <form
          className="rounded-2xl border border-border bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="book-title" label="Title *" error={errors.title} className="sm:col-span-2">
              <Input {...fieldProps("title")} required />
            </Field>
            <Field id="book-authors" label="Authors *" error={errors.authors} hint="Separate several with commas">
              <Input {...fieldProps("authors")} required />
            </Field>
            <Field id="book-isbn" label="ISBN" error={errors.isbn}>
              <Input {...fieldProps("isbn")} inputMode="numeric" />
            </Field>
            <Field id="book-summary" label="One-line summary" hint="Shown on catalog cards (140 characters max)" className="sm:col-span-2" error={errors.summary}>
              <Input {...fieldProps("summary")} maxLength={140} />
            </Field>
            <Field id="book-description" label="Description" className="sm:col-span-2" error={errors.description}>
              <Textarea {...fieldProps("description")} rows={4} />
            </Field>
            <Field id="book-primaryGenre" label="Genre">
              <select
                {...fieldProps("primaryGenre")}
                className="h-11 rounded-xl border border-input bg-surface px-3 text-[15px] focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:outline-none"
              >
                <option value="">Choose a genre…</option>
                {PRIMARY_GENRES.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="book-tags" label="Tags" hint="e.g. Japan, Translated, Cozy">
              <Input {...fieldProps("tags")} />
            </Field>
            <Field id="book-publisher" label="Publisher" error={errors.publisher}>
              <Input {...fieldProps("publisher")} />
            </Field>
            <Field id="book-language" label="Language" error={errors.language}>
              <Input {...fieldProps("language")} />
            </Field>
            <Field id="book-year" label="Year" error={errors.year}>
              <Input {...fieldProps("year")} inputMode="numeric" />
            </Field>
            <Field id="book-pages" label="Pages" error={errors.pages}>
              <Input {...fieldProps("pages")} inputMode="numeric" />
            </Field>
            <Field id="book-totalCopies" label="Copies *" error={errors.totalCopies}>
              <Input {...fieldProps("totalCopies")} inputMode="numeric" />
            </Field>
            <Field id="book-shelfLocation" label="Shelf" hint="e.g. B-12" error={errors.shelfLocation}>
              <Input {...fieldProps("shelfLocation")} />
            </Field>
            <Field id="book-coverUrl" label="Cover image URL" className="sm:col-span-2" error={errors.coverUrl}>
              <Input {...fieldProps("coverUrl")} placeholder="https://covers.openlibrary.org/…" />
            </Field>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="submit" size="lg" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {mode === "edit" ? "Save changes" : "Add to catalog"}
            </Button>
            <Button type="button" size="lg" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      </div>

      <aside className="order-first lg:order-none">
        <div className="lg:sticky lg:top-6">
          <p className="mb-2 text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Preview</p>
          <div className="flex gap-4 lg:flex-col">
            <BookCover
              key={values.coverUrl}
              title={values.title || "Untitled"}
              coverUrl={values.coverUrl || null}
              size="lg"
              className="w-[120px] lg:w-full"
            />
            <div className="min-w-0">
              <p className="font-bold">{values.title || "Untitled"}</p>
              <p className="text-sm text-ink-2">{values.authors || "Author"}</p>
              {values.summary && <p className="mt-1 text-sm text-ink-3">{values.summary}</p>}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
