/**
 * Applies pending SQL migrations from src/server/db/migrations.
 * Usage: pnpm db:migrate
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  await migrate(drizzle(pool), { migrationsFolder: "src/server/db/migrations" });
  await pool.end();
  console.log("✓ Migrations applied");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
