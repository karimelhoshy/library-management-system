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

/**
 * Chat, tool-use and vision models, tried in this order when one is overloaded or slow.
 * Override with GEMINI_MODEL (one model, or several separated by commas).
 */
export function geminiModels(): string[] {
  const models = (process.env.GEMINI_MODEL ?? "").split(",").map((model) => model.trim()).filter(Boolean);
  return models.length ? models : ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];
}

/** How many AI requests the whole library may make per day. Override with AI_DAILY_BUDGET. */
export function aiDailyBudget(): number {
  return Number(process.env.AI_DAILY_BUDGET) || 300;
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
