/**
 * Backfills embeddings for books that don't have one (or whose text changed).
 * Needs GEMINI_API_KEY. Usage: pnpm db:embed
 */
import { pool } from "@/server/db";
import { refreshEmbeddings } from "@/server/services/books";

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY is not set; nothing to do.");
    return;
  }
  const count = await refreshEmbeddings();
  console.log(`✓ Embedded ${count} books`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
