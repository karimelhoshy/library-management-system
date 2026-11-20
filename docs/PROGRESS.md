# Progress

## Phase 1 · Scaffold — done
Next.js 16 + Tailwind 4 + shadcn (Radix), design tokens in `globals.css`, Drizzle schema with pgvector/pg_trgm migrations, deterministic seed (60 verified books, 119 loans), app shell (sidebar, chat column, mobile tab bar), LICENSE, `.env.example`, CI.
Check: `pnpm dev` shows the seeded catalog in the approved layout; lint, typecheck and 59 tests pass.

## Phase 2 · Auth and roles — done
Auth.js v5 (Google + demo provider gated by `DEMO_MODE`), `can()` permission matrix, `forbidden()` 403 pages, role switcher that swaps the real session, sign-in page with demo cards.
Check: `can()` unit-tested for every role × action; services throw `ForbiddenError` (403) and integration tests prove members can't act for others.
