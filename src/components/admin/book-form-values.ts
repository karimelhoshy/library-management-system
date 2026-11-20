/**
 * The add/edit book form keeps every field as a string (that's what inputs hold).
 * These helpers convert to and from books, Open Library drafts and the server input.
 */
import { PRIMARY_GENRES } from "@/lib/config";
import type { BookDraft } from "@/lib/open-library";

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

/** The first known genre becomes the dropdown value; the rest become tags. */
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

/** Form strings → the shape `bookInputSchema` parses (empty fields become null). */
export function valuesToInput(values: BookFormValues) {
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
