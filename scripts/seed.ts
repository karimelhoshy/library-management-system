/**
 * Seeds demo users, ~60 real books and two months of loan history. Idempotent.
 * Usage: pnpm db:seed            (everything)
 *        pnpm db:seed --books-only  (just the sample catalog, for self-hosters)
 */
import { pool } from "@/server/db";
import { seedDatabase } from "@/server/db/seed";

seedDatabase({ booksOnly: process.argv.includes("--books-only") })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
