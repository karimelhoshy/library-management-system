import { ApiError, GoogleGenAI } from "@google/genai";
import { isAiEnabled } from "@/server/env";

let client: GoogleGenAI | null = null;

/** Shared Gemini client, or null when GEMINI_API_KEY is not configured. */
export function getGenAI(): GoogleGenAI | null {
  if (!isAiEnabled()) return null;
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export class AiUnavailableError extends Error {
  constructor(message = "AI features are turned off on this library.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Turns Gemini errors into a message we can show people. */
export function friendlyAiError(error: unknown): string {
  if (error instanceof AiUnavailableError) return error.message;
  const status = error instanceof ApiError ? error.status : undefined;
  if (status === 429) {
    return "The librarian is getting a lot of questions right now. Please try again in a minute.";
  }
  if (status && status >= 500) {
    return "The AI service is having a moment. Please try again shortly.";
  }
  return "Something went wrong talking to the AI. Please try again.";
}
