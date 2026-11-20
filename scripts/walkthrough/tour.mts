/**
 * The tour, in order. Each step lists its narration first (shown as captions and spoken
 * by the voiceover), then the clicks. Edit the words here; reorder or drop whole steps freely.
 */
import type { Browser, Page } from "@playwright/test";
import { click, nav, pointAt, scrollMain, settle, switchAccount, typeInto, wait } from "./actions.mjs";
import { BASE_URL, VIEWPORT } from "./config.mjs";

export type TourState = { ai: boolean };

type StepContext<Line extends string> = {
  page: Page;
  state: TourState;
  /** Shows and speaks one of the step's lines. `{ wait: false }` carries on while it plays. */
  say: (line: Line, options?: { wait?: boolean }) => Promise<void>;
};

export type Step = {
  id: string;
  title: string;
  lines: Record<string, string>;
  when?: (state: TourState) => boolean;
  run: (ctx: StepContext<string>) => Promise<void>;
};

/** Ties `say("key")` to the step's own lines, so a typo in a key fails the typecheck. */
function step<Lines extends Record<string, string>>(def: {
  id: string;
  title: string;
  lines: Lines;
  when?: (state: TourState) => boolean;
  run: (ctx: StepContext<Extract<keyof Lines, string>>) => Promise<void>;
}): Step {
  return def;
}

export const STEPS: Step[] = [
  step({
    id: "intro",
    title: "Sign in",
    lines: {
      hello: "Shelfwise is a small library system with an AI librarian built in.",
      demo: "Demo accounts sign in with one click. We'll start as Maya, a library member.",
    },
    async run({ page, state, say }) {
      await say("hello");
      await say("demo", { wait: false });
      await click(page, page.getByRole("button", { name: /Continue as Member/ }));
      await page.getByRole("heading", { name: "What are you reading next?" }).waitFor();
      // The chat box is disabled when the instance has no Gemini key; AI steps are skipped then.
      state.ai = await page.locator("#chat-input-column").isEnabled();
      await settle(page);
    },
  }),
  step({
    id: "home",
    title: "Maya's catalog",
    lines: {
      hold: "Maya's hold on Educated is ready to pick up…",
      overdue: "…and one of her loans is overdue, so the sidebar flags it.",
    },
    async run({ page, say }) {
      await pointAt(page, page.getByText(/is ready to pick up/).first());
      await say("hold");
      await pointAt(page, nav(page, "My loans"));
      await say("overdue");
    },
  }),
  step({
    id: "search",
    title: "Typo-tolerant search",
    lines: {
      search: "Search covers title, author, ISBN and tags. It forgives typos and updates as you type.",
    },
    async run({ page, say }) {
      await say("search", { wait: false });
      await typeInto(page, page.getByLabel("Search the catalog"), "hobit");
      await page.getByRole("link", { name: /The Hobbit/ }).first().waitFor();
    },
  }),
  step({
    id: "borrow",
    title: "Borrow with Undo",
    lines: {
      availability: "On the book page, availability is worked out from copies, loans and holds. It's never stored.",
      locked: "Borrowing locks the book's row, so two people can never take the last copy.",
      undo: "And every borrow or return can be undone, in case of a slip.",
    },
    async run({ page, say }) {
      await click(page, page.getByRole("link", { name: /The Hobbit/ }).first());
      await page.getByRole("heading", { level: 1, name: "The Hobbit" }).waitFor();
      await settle(page);
      const book = page.locator("article");
      // If an earlier run left it on loan, return it first (off-script, before the narration).
      const returnButton = book.getByRole("button", { name: "Return" });
      if (await returnButton.isVisible()) {
        await click(page, returnButton);
        await book.getByRole("button", { name: /Borrow · due/ }).waitFor();
      }
      await say("availability");
      await click(page, book.getByRole("button", { name: /Borrow · due/ }));
      await page.getByText(/Borrowed “The Hobbit”/).waitFor();
      await say("locked");
      await click(page, page.getByRole("button", { name: "Undo" }));
      await page.getByText("Loan undone").waitFor();
      await say("undo");
    },
  }),
  step({
    id: "filters",
    title: "Filters in the URL",
    lines: {
      url: "Filters live in the URL, so any search can be shared or bookmarked.",
    },
    async run({ page, say }) {
      await click(page, nav(page, "Catalog"));
      await page.getByRole("heading", { name: "What are you reading next?" }).waitFor();
      await settle(page);
      await say("url", { wait: false });
      await click(page, page.getByRole("button", { name: "Available now" }));
      await click(page, page.getByRole("button", { name: "Any genre" }));
      await click(page, page.getByRole("menuitem", { name: "Mystery" }));
      await settle(page);
    },
  }),
  step({
    id: "vibe",
    title: "Search by vibe",
    when: (state) => state.ai,
    lines: {
      vibe: "Search by vibe ranks every book by meaning, using Gemini embeddings stored in Postgres.",
    },
    async run({ page, say }) {
      await page.goto(`${BASE_URL}/`);
      await settle(page);
      await say("vibe", { wait: false });
      await click(page, page.getByRole("button", { name: "Search by vibe" }));
      await typeInto(page, page.getByLabel("Search the catalog"), "cozy mystery set in Japan");
      await page.getByText("Sorted by meaning").waitFor({ timeout: 20_000 });
      await settle(page);
    },
  }),
  step({
    id: "ask",
    title: "Ask the Librarian",
    when: (state) => state.ai,
    lines: {
      ask: "Ask the Librarian can search, check the shelf, and place holds, borrow or renew for you.",
      confirm: "Anything that changes data comes back as a card. Nothing happens until you confirm it.",
    },
    async run({ page, say }) {
      const chat = page.getByRole("region", { name: "Ask the Librarian" });
      await click(page, chat.getByRole("button", { name: "New chat" }));
      await say("ask", { wait: false });
      await typeInto(page, page.locator("#chat-input-column"), "Something short and funny I can borrow today");
      await page.keyboard.press("Enter");
      const confirm = chat.getByRole("button", { name: /^(Borrow|Place hold|Renew)$/ }).first();
      const proposed = await confirm
        .waitFor({ timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
      await settle(page);
      if (!proposed) return wait(page, 3000);
      await say("confirm");
      await click(page, confirm);
      await chat.getByRole("status").last().waitFor({ timeout: 20_000 });
      await wait(page, 2000);
    },
  }),
  step({
    id: "ai-off",
    title: "Without an AI key",
    when: (state) => !state.ai,
    lines: {
      off: "This copy has no AI key, so the chat and vibe search switch themselves off. Everything else still works.",
    },
    async run({ page, say }) {
      await pointAt(page, page.getByRole("region", { name: "Ask the Librarian" }));
      await say("off");
    },
  }),
  step({
    id: "loans",
    title: "My loans",
    lines: {
      loans: "My loans shows due dates and overdue books. A loan can be renewed once, if nobody is waiting.",
    },
    async run({ page, say }) {
      await click(page, nav(page, "My loans"));
      const onLoan = page.getByRole("region", { name: /On loan/ });
      await onLoan.waitFor();
      await settle(page);
      await say("loans", { wait: false });
      await pointAt(page, onLoan.getByRole("button", { name: "Renew" }).first());
    },
  }),
  step({
    id: "switch",
    title: "Switching roles",
    lines: {
      session: "The account switcher changes the real session, so the server enforces each role's permissions.",
    },
    async run({ page, say }) {
      await say("session", { wait: false });
      await switchAccount(page, "Leo Brandt", "Librarian");
    },
  }),
  step({
    id: "dashboard",
    title: "Librarian dashboard",
    lines: {
      dashboard: "Librarians get a dashboard with loans per day, the most borrowed books, overdue loans and recent activity.",
    },
    async run({ page, say }) {
      await click(page, nav(page, "Dashboard"));
      await page.waitForURL(`${BASE_URL}/admin`);
      await settle(page);
      await say("dashboard", { wait: false });
      await wait(page, 1500);
      await scrollMain(page, 520);
    },
  }),
  step({
    id: "add-book",
    title: "Add a book by ISBN",
    lines: {
      isbn: "Librarians add books by ISBN, or by scanning the barcode with a phone. Open Library fills in the details.",
      photo: "With AI on, you can also photograph a whole shelf, then review each match before importing.",
    },
    async run({ page, state, say }) {
      await click(page, nav(page, "Add books"));
      await page.locator("#isbn-lookup").waitFor();
      await settle(page);
      await say("isbn", { wait: false });
      await typeInto(page, page.locator("#isbn-lookup"), "9780804172448");
      await click(page, page.getByRole("button", { name: "Look up" }));
      await page
        .getByText(/Found it on Open Library|already in the catalog|doesn't know this ISBN/)
        .first()
        .waitFor({ timeout: 20_000 })
        .catch(() => console.warn("  Open Library didn't answer in time; carrying on."));
      // Open Library's large covers can take a few seconds; hold until the preview shows one.
      await page
        .waitForFunction("(() => { const i = document.querySelector('aside img'); return !!i && i.complete && i.naturalWidth > 0; })()", null, { timeout: 15_000 })
        .catch(() => console.warn("  The cover didn't load in time; carrying on."));
      await wait(page, 2000);
      if (state.ai) {
        await click(page, page.getByRole("link", { name: "From a shelf photo" }));
        await settle(page);
        await say("photo");
      }
    },
  }),
  step({
    id: "outbox",
    title: "Email outbox",
    lines: {
      outbox: "A daily job sends due-soon and overdue reminders. Every email is also kept here, in the Outbox.",
    },
    async run({ page, say }) {
      await click(page, nav(page, "Outbox"));
      await page.waitForURL(`${BASE_URL}/admin/outbox`);
      await settle(page);
      await say("outbox", { wait: false });
      await click(page, page.locator("main li button").first());
      const preview = page.getByRole("dialog");
      await preview.waitFor();
      await wait(page, 3500);
      // Escape would go to the email's iframe, so close with the button.
      await click(page, preview.getByRole("button", { name: "Close" }));
      await preview.waitFor({ state: "hidden" });
    },
  }),
  step({
    id: "admin",
    title: "Roles for admins",
    lines: {
      roles: "Admins manage roles. In the demo, staff can only change demo accounts, never real ones.",
    },
    async run({ page, say }) {
      await switchAccount(page, "Ada Okafor", "Admin");
      await click(page, nav(page, "Users"));
      await page.waitForURL(`${BASE_URL}/admin/users`);
      await settle(page);
      await say("roles", { wait: false });
      await click(page, page.getByRole("combobox", { name: "Role for Sam Rivera" }));
      await click(page, page.getByRole("option", { name: "Librarian" }));
      await page.getByText("Sam Rivera is now a Librarian").waitFor();
    },
  }),
  step({
    id: "outro",
    title: "Wrap-up",
    lines: {
      stack: "Shelfwise is built with Next.js, Postgres, Auth.js and Gemini, and it's open source under the MIT license.",
    },
    async run({ page, say }) {
      await click(page, nav(page, "Catalog"));
      await settle(page);
      await say("stack");
      await wait(page, 1000);
    },
  }),
];

/** Puts back what the tour changes (Sam's role), so the next run starts the same way. Off camera. */
export async function restoreDemo(browser: Browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/sign-in`);
  await page.getByRole("button", { name: /Continue as Admin/ }).click();
  await page.waitForURL(`${BASE_URL}/`);
  await page.goto(`${BASE_URL}/admin/users`);
  const role = page.getByRole("combobox", { name: "Role for Sam Rivera" });
  // The select fills in its label after hydration; wait for it before reading.
  await role.filter({ hasText: /Admin|Librarian|Member/ }).waitFor();
  if (!(await role.innerText()).includes("Member")) {
    await role.click();
    await page.getByRole("option", { name: "Member" }).click();
    await page.getByText("Sam Rivera is now a Member").waitFor();
  }
  await context.close();
}
