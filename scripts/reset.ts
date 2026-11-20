/**
 * Wipes loans, holds, activity, emails, chats and added books, then re-seeds.
 * Usage: pnpm db:reset
 */
import { pool } from "@/server/db";
import { resetDemoData } from "@/server/db/seed";

resetDemoData()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
