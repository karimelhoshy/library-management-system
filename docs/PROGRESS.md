# Progress

## Phase 1 · Scaffold — done
Next.js 16 + Tailwind 4 + shadcn (Radix), design tokens in `globals.css`, Drizzle schema with pgvector/pg_trgm migrations, deterministic seed (60 verified books, 119 loans), app shell (sidebar, chat column, mobile tab bar), LICENSE, `.env.example`, CI.
Check: `pnpm dev` shows the seeded catalog in the approved layout; lint, typecheck and 59 tests pass.

## Phase 2 · Auth and roles — done
Auth.js v5 (Google + demo provider gated by `DEMO_MODE`), `can()` permission matrix, `forbidden()` 403 pages, role switcher that swaps the real session, sign-in page with demo cards.
Check: `can()` unit-tested for every role × action; services throw `ForbiddenError` (403) and integration tests prove members can't act for others.

## Phase 3 · Core — done
Catalog with typo-tolerant search, filters and URL-synced queries; book detail (desktop + mobile sheet with sticky Borrow/Ask bar); add/edit/delete with ISBN lookup and barcode scan; optimistic borrow/return with Undo toasts; My loans & holds.
Check: Vitest covers double-booking and availability math against Postgres; the Playwright smoke test (Member → search "hobit" → borrow → return) and the 403 test pass.

## Phase 4 · Library ops — done
Holds queue with promotion on return/cancel/expiry, renewals, overdue badges, loans desk (return on behalf, overdue filter), dashboard (stats, 30-day chart, top borrowed, overdue list, activity), activity log, ⌘K palette, ISBN lookup + camera scan, users admin with role dropdown, mobile profile page.
Check: lint, typecheck, 59 unit/integration tests and both Playwright smoke tests pass; demo staff are scoped to demo accounts.

## Phase 5 · AI — done (pending a live key check)
Embeddings on save/seed with hash-based refresh, Search by vibe (pgvector cosine), Ask the Librarian (Gemini function calling, ≤5 steps, NDJSON streaming, confirm cards, mini book cards, per-user history and rate limit), shelf-photo import (vision → Open Library → review table).
Check: an integration test drives the agent loop with a scripted model (search → propose hold → confirm → hold exists); with GEMINI_API_KEY unset every AI surface shows a friendly off state. Live Gemini run still to do once a key is provided.

## Phase 6 · Notifications — done
Branded email templates, Nodemailer/Gmail transport, outbox writer with dedupe keys, daily `/api/cron/reminders` (CRON_SECRET, demo reset, hold expiry, due-soon/overdue reminders), Outbox page with sandboxed previews, in-app ready-hold notices, `vercel.json` cron at 06:00 UTC.
Check: cron returns 401 without the secret; with it the demo resets and the outbox repopulates; a second run sends nothing new.

## Phase 7 · Polish and ship — in progress
Done: full-screen /ask page, mobile pass (scrolling filter chips, full-width vibe button, tab bar), favicon, Open Graph image, README, CONTRIBUTING, Playwright screenshot script, production build passes. Split the largest files, lint-enforced layer boundaries, `pnpm video` walkthrough recorder.
Waiting on: Vercel login + production secrets (Neon, Gemini, Google OAuth, Gmail) to deploy, run migrations/seed, re-take AI screenshots and run the smoke test against the live URL.
