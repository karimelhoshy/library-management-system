import { z } from "zod";
import { toIsbn13 } from "./isbn";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

const optionalInt = (min: number, max: number) =>
  z.coerce
    .number()
    .int()
    .min(min)
    .max(max)
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null))
    .transform((value) => (value === undefined ? null : value));

const stringList = z
  .union([z.array(z.string()), z.string()])
  .transform((value) => (Array.isArray(value) ? value : value.split(",")))
  .transform((list) =>
    [...new Set(list.map((item) => item.trim()).filter(Boolean))].slice(0, 20),
  );

export const bookInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  authors: stringList.refine((list) => list.length > 0, "Add at least one author"),
  isbn: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value, ctx) => {
      if (!value) return null;
      const isbn = toIsbn13(value);
      if (!isbn) {
        ctx.addIssue({ code: "custom", message: "That isn't a valid ISBN-10 or ISBN-13" });
        return z.NEVER;
      }
      return isbn;
    }),
  coverUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || /^https:\/\/\S+$/.test(value), "Use an https:// image URL"),
  summary: optionalText(140),
  description: optionalText(5000),
  genres: stringList.optional().transform((list) => list ?? []),
  publisher: optionalText(200),
  year: optionalInt(0, new Date().getFullYear() + 1),
  pages: optionalInt(1, 20000),
  language: z.string().trim().min(1).max(60).default("English"),
  totalCopies: z.coerce.number().int().min(0, "Copies can't be negative").max(999).default(1),
  shelfLocation: optionalText(40),
});

export type BookInput = z.input<typeof bookInputSchema>;
export type ParsedBookInput = z.output<typeof bookInputSchema>;

export const searchParamsSchema = z.object({
  q: z.string().trim().max(200).catch(""),
  vibe: z
    .enum(["1"])
    .optional()
    .catch(undefined)
    .transform((value) => value === "1"),
  genre: z.string().trim().max(60).optional().catch(undefined),
  tag: z.string().trim().max(60).optional().catch(undefined),
  available: z
    .enum(["1"])
    .optional()
    .catch(undefined)
    .transform((value) => value === "1"),
  lang: z.string().trim().max(60).optional().catch(undefined),
  yearFrom: z.coerce.number().int().min(0).max(3000).optional().catch(undefined),
  yearTo: z.coerce.number().int().min(0).max(3000).optional().catch(undefined),
  maxPages: z.coerce.number().int().min(1).max(20000).optional().catch(undefined),
  minPages: z.coerce.number().int().min(1).max(20000).optional().catch(undefined),
  recent: z
    .enum(["1"])
    .optional()
    .catch(undefined)
    .transform((value) => value === "1"),
  sort: z.enum(["relevance", "title", "newest", "popular"]).catch("relevance"),
  /** How many results to show; "Show more" raises it a page at a time. */
  show: z.coerce.number().int().min(1).max(1000).optional().catch(undefined),
});

export type CatalogQuery = z.output<typeof searchParamsSchema>;

/** Parses Next.js searchParams (string | string[] values) into a typed catalog query. */
export function parseCatalogQuery(
  params: Record<string, string | string[] | undefined>,
): CatalogQuery {
  const flat = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  return searchParamsSchema.parse(flat);
}
