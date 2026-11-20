import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests. Locally they start `pnpm dev` (or reuse a running server).
 * Against a deployment: PLAYWRIGHT_BASE_URL=https://your-app.vercel.app pnpm test:e2e
 * The app must run with DEMO_MODE=true and a seeded database.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : { command: "pnpm dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
