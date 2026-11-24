import { ApiError, GoogleGenAI } from "@google/genai";
import { geminiModels, isAiEnabled } from "@/server/env";

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

/** Overloaded, rate-limited or out of daily quota: another model may still answer. */
function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 429 || error.status >= 500);
}

/**
 * Runs a Gemini call on each model in turn until one answers. Free-tier models are sometimes
 * overloaded or silent, and each has its own daily quota, so this keeps the AI features up when
 * one model isn't. A model that hasn't answered within `timeoutMs` is abandoned: `call` must
 * pass the signal to the SDK and resolve once the first output has arrived.
 */
export async function withModelFallback<T>(
  call: (model: string, signal: AbortSignal) => Promise<T>,
  { models = geminiModels(), timeoutMs = 20_000 }: { models?: string[]; timeoutMs?: number } = {},
): Promise<{ value: T; model: string }> {
  let lastError: unknown;
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return { value: await call(model, controller.signal), model };
    } catch (error) {
      const timedOut = controller.signal.aborted;
      if (!timedOut && !isRetryable(error)) throw error;
      lastError = timedOut ? new ApiError({ message: `${model} didn't answer in time`, status: 504 }) : error;
      console.warn(`[ai] ${model} unavailable (${timedOut ? "timeout" : (error as ApiError).status}), trying the next model`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
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
