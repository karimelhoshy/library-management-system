"use server";

import { quickFindBooks } from "@/server/services/catalog";
import { withUser, type ActionResult } from "./result";

export type PaletteBook = { id: string; title: string; authors: string[] };

/** Book suggestions for the ⌘K palette. */
export async function paletteSearchAction(q: string): Promise<ActionResult<PaletteBook[]>> {
  return withUser(async () => {
    const rows = await quickFindBooks(q.slice(0, 100), 8);
    return rows.map(({ id, title, authors }) => ({ id, title, authors }));
  });
}
