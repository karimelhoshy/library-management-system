"use client";

import { Loader2 } from "lucide-react";
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
import { bookInputSchema } from "@/lib/validation";
import { createBookAction, updateBookAction } from "@/server/actions/books";
import { draftToValues, EMPTY_BOOK, valuesToInput, type BookFormValues } from "./book-form-values";
import { IsbnLookupPanel } from "./isbn-lookup";

type FieldErrors = Partial<Record<keyof BookFormValues, string>>;

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
    // min-w-0 stops a long, auto-sized description from widening the grid on phones.
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
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

function BookPreview({ values }: { values: BookFormValues }) {
  return (
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
  );
}

/** Add or edit a book. Validates with the same zod schema the server uses. */
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, startSave] = useTransition();

  const save = () => {
    const input = valuesToInput(values);
    const parsed = bookInputSchema.safeParse(input);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof BookFormValues;
        next[key] ??= issue.message;
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
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [key]: event.target.value })),
    "aria-invalid": Boolean(errors[key]) || undefined,
    "aria-describedby": errors[key] ? `book-${key}-error` : undefined,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="flex min-w-0 flex-col gap-6">
        {mode === "create" && (
          <IsbnLookupPanel
            initialIsbn={initial.isbn}
            onFound={(draft) => {
              setValues((v) => draftToValues(draft, v));
              setErrors({});
            }}
            onNotFound={(isbn) => setValues((v) => ({ ...v, isbn }))}
          />
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
            <Field
              id="book-summary"
              label="One-line summary"
              hint="Shown on catalog cards (140 characters max)"
              className="sm:col-span-2"
              error={errors.summary}
            >
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

      <BookPreview values={values} />
    </div>
  );
}
