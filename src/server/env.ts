/**
 * Server-side feature flags. Every optional integration degrades gracefully:
 * the app only needs DATABASE_URL and AUTH_SECRET to boot.
 * Read at call time (not module load) so tests and scripts can toggle them.
 */

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function isAiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function isGoogleAuthEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}

export function isEmailEnabled(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** Chat, tool-use and vision model. Override with GEMINI_MODEL. */
export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.8-flash";
}

/** Embedding model. Override with GEMINI_EMBEDDING_MODEL. */
export function geminiEmbeddingModel(): string {
  return process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
}

/** Absolute base URL used in emails. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
