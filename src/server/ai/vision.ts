import { AiUnavailableError, getGenAI, withModelFallback } from "./client";

export type DetectedBook = { title: string; author: string | null; confidence: number };

const PROMPT = `You are helping a librarian catalogue books from a photo of a shelf, a stack, or covers.
List every book whose title you can read. For each, give the title as printed (fix obvious OCR noise and
capitalisation), the author if visible or if you are confident who wrote it, and your confidence from 0 to 1
that the title is correct. Skip anything that is not a book. Return at most 30 items.`;

const SCHEMA = {
  type: "object",
  properties: {
    books: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          author: { type: ["string", "null"] },
          confidence: { type: "number" },
        },
        required: ["title", "author", "confidence"],
      },
    },
  },
  required: ["books"],
};

/** Reads book titles from an image with Gemini vision and structured JSON output. */
export async function detectBooksInImage(base64: string, mimeType: string): Promise<DetectedBook[]> {
  const ai = getGenAI();
  if (!ai) throw new AiUnavailableError();
  const { value: response } = await withModelFallback(
    (model, signal) =>
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: base64 } }, { text: PROMPT }] }],
        config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, temperature: 0.2, abortSignal: signal },
      }),
    { timeoutMs: 45_000 },
  );
  const parsed = JSON.parse(response.text ?? "{}") as { books?: Partial<DetectedBook>[] };
  return (parsed.books ?? [])
    .filter((book): book is DetectedBook => typeof book.title === "string" && book.title.trim().length > 0)
    .map((book) => ({
      title: book.title.trim().slice(0, 200),
      author: book.author?.trim().slice(0, 120) || null,
      confidence: Math.max(0, Math.min(1, Number(book.confidence) || 0)),
    }))
    .slice(0, 30);
}
