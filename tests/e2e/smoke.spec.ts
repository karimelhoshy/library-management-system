import { expect, test } from "@playwright/test";

test("demo member can search, borrow and return a book", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: /Continue as Member/ }).click();
  await expect(page.getByRole("heading", { name: "What are you reading next?" })).toBeVisible();

  // Typo-tolerant search, results update as you type (no Enter).
  await page.getByLabel("Search the catalog").fill("hobit");
  const card = page.getByRole("link", { name: /The Hobbit/ }).first();
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(/q=hobit/);
  await card.click();

  await expect(page.getByRole("heading", { level: 1, name: "The Hobbit" })).toBeVisible();
  const main = page.locator("article");

  // If an earlier run left it on loan, return it first so the test is repeatable.
  const returnButton = main.getByRole("button", { name: "Return" });
  if (await returnButton.isVisible()) {
    await returnButton.click();
    await expect(main.getByRole("button", { name: /Borrow · due/ })).toBeVisible();
  }

  await main.getByRole("button", { name: /Borrow · due/ }).click();
  await expect(page.getByText(/Borrowed “The Hobbit”/)).toBeVisible();
  await expect(main.getByText(/On loan to you · due/)).toBeVisible();

  await page.goto("/loans");
  await expect(page.getByRole("region", { name: /On loan/ }).getByRole("link", { name: /The Hobbit/ })).toBeVisible();

  await page.goto("/");
  await page.getByLabel("Search the catalog").fill("The Hobbit");
  await page.getByRole("link", { name: /The Hobbit/ }).first().click();
  await page.locator("article").getByRole("button", { name: "Return" }).click();
  await expect(page.getByText(/Returned “The Hobbit”/)).toBeVisible();
  await expect(page.locator("article").getByRole("button", { name: /Borrow · due/ })).toBeVisible();
});

test("members can't open staff pages", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: /Continue as Member/ }).click();
  await expect(page.getByRole("heading", { name: "What are you reading next?" })).toBeVisible();
  const response = await page.goto("/admin/books/new");
  expect(response?.status()).toBe(403);
  await expect(page.getByText("This page is for library staff")).toBeVisible();
});
