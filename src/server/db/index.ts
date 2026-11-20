import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One connection pool per server instance. In development, Next.js hot reloads
 * modules, so the pool is cached on globalThis to avoid exhausting connections.
 */
const globalForDb = globalThis as unknown as { shelfwisePool?: Pool };

function createPool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: process.env.VERCEL ? 5 : 10,
    idleTimeoutMillis: 10_000,
  });
  // Lets Vercel Fluid Compute close idle connections before an instance is suspended.
  if (process.env.VERCEL) attachDatabasePool(pool);
  return pool;
}

export const pool = globalForDb.shelfwisePool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.shelfwisePool = pool;

export const db = drizzle(pool, { schema });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run a query: the root db or an open transaction. */
export type Executor = Database | Transaction;
