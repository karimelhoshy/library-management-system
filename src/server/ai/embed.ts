import { createHash } from "node:crypto";
import { EMBEDDING_DIMENSIONS } from "@/server/db/schema";
import { geminiEmbeddingModel } from "@/server/env";
import { getGenAI } from "./client";

type EmbeddableBook = {
  title: string;
  authors: string[];
  genres: string[];
  summary?: string | null;
  description?: string | null;
};

/** The text we embed for a book. Its hash tells us when to re-embed. */
export function bookEmbeddingText(book: EmbeddableBook): string {
  return [
    `Title: ${book.title}`,
    `Authors: ${book.authors.join(", ")}`,
    book.genres.length ? `Genres: ${book.genres.join(", ")}` : "",
    book.summary ? `Summary: ${book.summary}` : "",
    book.description ? `Description: ${book.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function embeddingHash(text: string): string {
  return createHash("sha256").update(`${geminiEmbeddingModel()}:${text}`).digest("hex").slice(0, 32);
}

/** Reduced-dimension Gemini embeddings must be normalized to unit length. */
export function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? values : values.map((v) => v / norm);
}

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** Embeds up to 100 texts in one request. Returns null when AI is not configured. */
export async function embedTexts(texts: string[], taskType: TaskType): Promise<number[][] | null> {
  const ai = getGenAI();
  if (!ai || texts.length === 0) return null;
  const response = await ai.models.embedContent({
    model: geminiEmbeddingModel(),
    contents: texts,
    config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error(`Expected ${texts.length} embeddings, got ${embeddings.length}`);
  }
  return embeddings.map((e) => normalize(e.values ?? []));
}

export async function embedQuery(query: string): Promise<number[] | null> {
  const result = await embedTexts([query], "RETRIEVAL_QUERY");
  return result?.[0] ?? null;
}

/** pgvector literal, e.g. "[0.1,0.2]". */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
