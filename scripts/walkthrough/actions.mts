/** Mouse and keyboard helpers that move at a human pace, so the recording is easy to follow. */
import type { Locator, Page } from "@playwright/test";
import { PACE } from "./config.mjs";

export const wait = (page: Page, ms: number) => page.waitForTimeout(ms * PACE);

export async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await wait(page, 400);
}

/** Glides the visible pointer to an element, the way a person would move the mouse. */
export async function pointAt(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  await wait(page, 250);
}

export async function click(page: Page, target: Locator) {
  await pointAt(page, target);
  await target.click();
  await wait(page, 350);
}

export async function typeInto(page: Page, target: Locator, text: string) {
  await click(page, target);
  await target.pressSequentially(text, { delay: 75 * PACE });
  await wait(page, 500);
}

/** A link in the sidebar. */
export function nav(page: Page, label: string) {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: new RegExp(`^${label}`) });
}

/** Uses the demo "Viewing as" menu, which signs in as another demo account. */
export async function switchAccount(page: Page, name: string, role: string) {
  await click(page, page.getByRole("button", { name: /Open account menu/ }));
  await click(page, page.getByRole("menuitem", { name: new RegExp(name) }));
  await page.getByRole("button", { name: /Open account menu/ }).filter({ hasText: role }).waitFor();
  await settle(page);
}

/** Scrolls in small wheel steps so the motion reads smoothly on video. */
export async function scrollMain(page: Page, pixels: number) {
  const box = await page.locator("main").boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  for (let moved = 0; moved < pixels; moved += 40) {
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(25);
  }
}
