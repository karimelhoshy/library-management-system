# Contributing

Thanks for helping. The short version: keep business rules in `src/server/services`, keep checks in `can()`, and keep the tests green.

## Setup

```bash
pnpm i
docker compose up -d            # Postgres 17 + pgvector on localhost:54329
cp .env.example .env.local      # DATABASE_URL + AUTH_SECRET are enough; DEMO_MODE=true for demo accounts
pnpm db:migrate && pnpm db:seed
pnpm dev
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` / `pnpm build` | Run or build the app |
| `pnpm lint` / `pnpm typecheck` | ESLint and `tsc --noEmit` (CI runs both) |
| `pnpm test` | Vitest unit tests; set `TEST_DATABASE_URL` to also run the Postgres integration tests |
| `pnpm test:e2e` | Playwright smoke tests (starts `pnpm dev` unless `PLAYWRIGHT_BASE_URL` is set) |
| `pnpm db:generate` | Create a migration after editing `src/server/db/schema.ts` |
| `pnpm db:migrate` / `db:seed` / `db:reset` | Apply migrations, seed, or wipe and reseed |
| `pnpm db:embed` | Backfill embeddings (needs `GEMINI_API_KEY`) |

The integration tests wipe their database between tests, so give them their own one:

```bash
docker exec -it <container> psql -U shelfwise -c "create database shelfwise_test"
TEST_DATABASE_URL=postgres://shelfwise:shelfwise@localhost:54329/shelfwise_test pnpm test
```

## Conventions

- **Rules live in services.** Server actions (`src/server/actions`) and AI tools (`src/server/ai/tools.ts`) are thin and call the same service functions. Pure rules (availability, renewals, hold promotion) go in `services/rules.ts` with unit tests.
- **Every write checks permissions** with `assertCan()` / `assertCanActFor()` and logs to the activity log inside its transaction.
- **Changes to a book's copies happen under `lockBook()`** so availability can't race.
- **Optional integrations degrade.** Anything that needs an env var (AI, email, Google) must work, or show a friendly "off" state, without it.
- **UI:** shadcn/Radix components, lucide icons, design tokens from `globals.css` (no hard-coded colours or gradients), real `<button>`/`<a>`/`<label>`, touch targets of at least 44px.
- TypeScript strict, Prettier-style formatting, small focused components. Record notable choices as one line in `docs/DECISIONS.md`.

## Pull requests

Keep them focused, describe the user-visible change, and include a test when you change a rule. CI must pass (lint, typecheck, unit + integration tests).
