/**
 * Captures README screenshots from a running instance (demo mode, seeded).
 * Usage: BASE_URL=http://localhost:3000 node --import tsx scripts/screenshots.mts
 */
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots";

async function signInAs(page: Page, role: "Admin" | "Librarian" | "Member") {
  await page.context().clearCookies();
  await page.goto(`${BASE}/sign-in`);
  await page.getByRole("button", { name: new RegExp(`Continue as ${role}`) }).click();
  await page.waitForURL(`${BASE}/`);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
}

const browser = await chromium.launch();
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await desktop.newPage();

await page.goto(`${BASE}/sign-in`);
await settle(page);
await page.screenshot({ path: `${OUT}/sign-in.png` });

await signInAs(page, "Member");
await page.goto(`${BASE}/?q=${encodeURIComponent(process.env.VIBE_QUERY ?? "cozy mystery set in Japan")}&vibe=1`);
await settle(page);
if (process.env.CHAT_PROMPT) {
  await page.getByLabel("Message the Librarian").first().fill(process.env.CHAT_PROMPT);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(12_000);
}
await page.screenshot({ path: `${OUT}/catalog.png` });

await page.goto(`${BASE}/loans`);
await settle(page);
await page.screenshot({ path: `${OUT}/loans.png` });

await signInAs(page, "Librarian");
await page.goto(`${BASE}/admin`);
await settle(page);
await page.screenshot({ path: `${OUT}/dashboard.png` });

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const mobile = await phone.newPage();
await signInAs(mobile, "Member");
await mobile.getByLabel("Search the catalog").fill("Suspect X");
await mobile.getByRole("link", { name: /The Devotion of Suspect X/ }).first().click();
await settle(mobile);
await mobile.screenshot({ path: `${OUT}/mobile-book.png` });

await browser.close();
console.log(`✓ Screenshots saved to ${OUT}/`);
