/**
 * Open Library client (no API key needed). Server-side only: called from
 * server actions and AI tools, never from the browser.
 */
import { PRIMARY_GENRES } from "./config";
import { openLibraryCoverUrl, toIsbn13 } from "./isbn";

const BASE = "https://openlibrary.org";
const HEADERS = { "User-Agent": "Shelfwise/1.0 (open-source library app)", Accept: "application/json" };

export type BookDraft = {
  title: string;
  authors: string[];
  isbn: string | null;
  coverUrl: string | null;
  description: string | null;
  genres: string[];
  publisher: string | null;
  year: number | null;
  pages: number | null;
  language: string;
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const LANGUAGES: Record<string, string> = {
  eng: "English",
  fre: "French",
  fra: "French",
  spa: "Spanish",
  ger: "German",
  deu: "German",
  jpn: "Japanese",
  ita: "Italian",
  por: "Portuguese",
  chi: "Chinese",
  zho: "Chinese",
  rus: "Russian",
  ara: "Arabic",
  kor: "Korean",
  dut: "Dutch",
  swe: "Swedish",
};

function languageName(code: string | undefined): string {
  if (!code) return "English";
  return LANGUAGES[code.replace("/languages/", "")] ?? "English";
}

const GENRE_HINTS: [RegExp, (typeof PRIMARY_GENRES)[number]][] = [
  [/myster|detective|crime|thriller|murder/i, "Mystery"],
  [/science fiction|sci-fi|space opera|dystopi/i, "Science Fiction"],
  [/fantasy|magic|dragons|myth/i, "Fantasy"],
  [/humou?r|comic|satire|funny/i, "Humor"],
  [/biograph|memoir|autobiograph/i, "Memoir"],
  [/histor/i, "History"],
  [/science|physics|biology|evolution|astronomy/i, "Science"],
];

/** Maps free-form Open Library subjects to one primary genre plus a few short tags. */
export function genresFromSubjects(subjects: string[]): string[] {
  const primary = GENRE_HINTS.find(([pattern]) => subjects.some((s) => pattern.test(s)))?.[1];
  const tags = subjects
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length <= 24 && !/[,:()]|fiction$/i.test(s) && !/^[a-z]/.test(s))
    .slice(0, 3);
  return [...new Set([primary ?? "Literary Fiction", ...tags])];
}

function parseYear(value: string | undefined): number | null {
  const match = value?.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

type WorkJson = { description?: string | { value?: string }; subjects?: string[] };

async function workDescription(workKey: string | undefined) {
  if (!workKey) return { description: null, subjects: [] as string[] };
  const work = await getJson<WorkJson>(`${BASE}${workKey}.json`);
  const raw = typeof work?.description === "string" ? work.description : work?.description?.value;
  // Trim Open Library's trailing source notes and links.
  const description = raw?.split(/\n-{3,}|\(\[source\]|\[source\]/i)[0]?.trim().slice(0, 2000) ?? null;
  return { description, subjects: work?.subjects ?? [] };
}

type EditionJson = {
  title?: string;
  works?: { key: string }[];
  languages?: { key: string }[];
  number_of_pages?: number;
  publishers?: string[];
  publish_date?: string;
  covers?: number[];
};

type BooksApiJson = Record<
  string,
  {
    title?: string;
    subtitle?: string;
    authors?: { name: string }[];
    publishers?: { name: string }[];
    publish_date?: string;
    number_of_pages?: number;
    cover?: { large?: string; medium?: string };
    subjects?: { name: string }[];
  }
>;

/** Full metadata for an ISBN, or null if Open Library doesn't know it. */
export async function lookupIsbn(rawIsbn: string): Promise<BookDraft | null> {
  const isbn = toIsbn13(rawIsbn);
  if (!isbn) return null;

  const [data, edition] = await Promise.all([
    getJson<BooksApiJson>(`${BASE}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`),
    getJson<EditionJson>(`${BASE}/isbn/${isbn}.json`),
  ]);
  const book = data?.[`ISBN:${isbn}`];
  if (!book && !edition) return null;

  const { description, subjects: workSubjects } = await workDescription(edition?.works?.[0]?.key);
  const subjects = [...(book?.subjects?.map((s) => s.name) ?? []), ...workSubjects];
  const hasCover = Boolean(book?.cover?.large || edition?.covers?.length);

  return {
    title: book?.title ?? edition?.title ?? "Untitled",
    authors: book?.authors?.map((a) => a.name) ?? [],
    isbn,
    coverUrl: hasCover ? openLibraryCoverUrl(isbn) : null,
    description,
    genres: genresFromSubjects(subjects),
    publisher: book?.publishers?.[0]?.name ?? edition?.publishers?.[0] ?? null,
    year: parseYear(book?.publish_date ?? edition?.publish_date),
    pages: book?.number_of_pages ?? edition?.number_of_pages ?? null,
    language: languageName(edition?.languages?.[0]?.key),
  };
}

type SearchJson = {
  docs?: {
    key?: string;
    title?: string;
    author_name?: string[];
    first_publish_year?: number;
    isbn?: string[];
    number_of_pages_median?: number;
    publisher?: string[];
    cover_i?: number;
    subject?: string[];
  }[];
};

/** Best Open Library match for a title (and optional author), used by shelf-photo import. */
export async function searchOpenLibrary(title: string, author?: string): Promise<BookDraft | null> {
  const params = new URLSearchParams({
    title,
    limit: "3",
    fields: "key,title,author_name,first_publish_year,isbn,number_of_pages_median,publisher,cover_i,subject",
  });
  if (author) params.set("author", author);
  const result = await getJson<SearchJson>(`${BASE}/search.json?${params}`);
  const doc = result?.docs?.[0];
  if (!doc?.title) return null;

  const isbn13 = doc.isbn?.find((value) => /^97[89]\d{10}$/.test(value)) ?? null;
  const { description } = await workDescription(doc.key);
  return {
    title: doc.title,
    authors: doc.author_name?.slice(0, 3) ?? (author ? [author] : []),
    isbn: isbn13,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
    description,
    genres: genresFromSubjects(doc.subject?.slice(0, 30) ?? []),
    publisher: doc.publisher?.[0] ?? null,
    year: doc.first_publish_year ?? null,
    pages: doc.number_of_pages_median ?? null,
    language: "English",
  };
}
