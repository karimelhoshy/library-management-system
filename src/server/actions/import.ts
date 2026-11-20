"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { friendlyAiError } from "@/server/ai/client";
import { consumeAiQuota } from "@/server/ai/rate-limit";
import { detectBooksInImage } from "@/server/ai/vision";
import { assertCan, DomainError } from "@/server/auth/permissions";
import { isAiEnabled } from "@/server/env";
import { importBooks, matchDetectedBooks, type ImportCandidate, type ImportItem } from "@/server/services/import";
import { withUser, type ActionResult } from "./result";

const MIME = z.enum(["image/jpeg", "image/png", "image/webp"]);

/** Reads titles from a shelf photo, then matches them against the catalog and Open Library. */
export async function scanShelfAction(base64: string, mimeType: string): Promise<ActionResult<ImportCandidate[]>> {
  return withUser(async (user) => {
    assertCan(user, "book:write");
    if (!isAiEnabled()) throw new DomainError("Shelf-photo import needs an AI key on this library.", 503);
    if (base64.length > 5_500_000) throw new DomainError("That photo is too large. Try a smaller one.", 413);
    await consumeAiQuota(user.id, "vision");
    let detected;
    try {
      detected = await detectBooksInImage(base64, MIME.parse(mimeType));
    } catch (error) {
      if (error instanceof DomainError) throw error;
      console.error("[scanShelf] vision failed", error);
      throw new DomainError(friendlyAiError(error), 502);
    }
    if (detected.length === 0) {
      throw new DomainError("I couldn't read any book titles in that photo. Try a closer, sharper shot.", 422);
    }
    return matchDetectedBooks(user, detected);
  });
}

// Drafts come back from the browser, so check them up front with the same limits as the
// book form (createBook re-validates with bookInputSchema before anything is saved).
const draftSchema = z.object({
  title: z.string().trim().min(1).max(300),
  authors: z.array(z.string().trim().min(1).max(120)).max(10),
  isbn: z
    .string()
    .regex(/^[0-9Xx-]{10,17}$/)
    .nullable(),
  coverUrl: z
    .string()
    .max(500)
    .regex(/^https:\/\/\S+$/, "Cover must be an https URL")
    .nullable(),
  description: z.string().max(5000).nullable(),
  genres: z.array(z.string().trim().min(1).max(60)).max(20),
  publisher: z.string().max(200).nullable(),
  year: z.number().int().min(0).max(3000).nullable(),
  pages: z.number().int().min(1).max(20000).nullable(),
  language: z.string().trim().min(1).max(60),
});

const itemsSchema = z
  .array(
    z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("copy"), bookId: z.string().uuid() }),
      z.object({ kind: z.literal("new"), draft: draftSchema }),
    ]),
  )
  .min(1, "Pick at least one book to import")
  .max(40);

export async function importShelfAction(items: ImportItem[]): Promise<ActionResult<{ created: number; copies: number }>> {
  const result = await withUser((user) => importBooks(user, itemsSchema.parse(items)));
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
