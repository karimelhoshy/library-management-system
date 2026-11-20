/**
 * Records a captioned walkthrough of a running Shelfwise instance (demo mode, seeded)
 * and saves it as an MP4, with chapter timestamps alongside.
 *
 *   pnpm video                                  # local dev server → recordings/shelfwise-walkthrough.mp4
 *   BASE_URL=https://<your-app> pnpm video      # record the live demo instead
 *   HEADED=1 PACE=1.5 CAPTIONS=0 pnpm video     # watch it play while you screen-record and talk over it
 *   GIF=ask pnpm video                          # also export one step as a GIF (ids are in STEPS below)
 *
 * Needs ffmpeg. For a clean run locally, `pnpm db:reset` first; the live demo resets nightly.
 * The tour is the STEPS list: each step is a few captions and clicks, so it's easy to reorder or edit.
 * AI steps run only when the instance has a Gemini key.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "@playwright/test";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PACE = Number(process.env.PACE ?? 1);
const HEADED = process.env.HEADED === "1";
const CAPTIONS = process.env.CAPTIONS !== "0";
const GIF_STEP = process.env.GIF;
const OUT_DIR = resolve("recordings");
const VIEWPORT = { width: 1600, height: 900 };
const VIDEO = { width: 1920, height: 1080 };

type Ctx = { page: Page; ai: boolean };
type Step = { id: string; title: string; when?: (ctx: Ctx) => boolean; run: (ctx: Ctx) => Promise<void> };

// ── The tour ────────────────────────────────────────────────────────────────

const STEPS: Step[] = [
  {
    id: "intro",
    title: "Sign in",
    async run(ctx) {
      const { page } = ctx;
      await say(page, "Shelfwise: a small library system with an AI librarian built in.");
      await say(page, "Demo accounts sign in with one click. Let's start as Maya, a member.");
      await click(page, page.getByRole("button", { name: /Continue as Member/ }));
      await page.getByRole("heading", { name: "What are you reading next?" }).waitFor();
      // The chat box is disabled when the instance has no Gemini key; AI steps are skipped then.
      ctx.ai = await page.locator("#chat-input-column").isEnabled();
      await settle(page);
    },
  },
  {
    id: "home",
    title: "Maya's catalog",
    async run({ page }) {
      await pointAt(page, page.getByText(/is ready to pick up/).first());
      await say(page, "Her hold on Educated is ready to pick up…");
      await pointAt(page, nav(page, "My loans"));
      await say(page, "…and one of her loans is overdue.");
    },
  },
  {
    id: "search",
    title: "Typo-tolerant search",
    async run({ page }) {
      await say(page, "Search covers title, author, ISBN and tags. It forgives typos and updates as you type.");
      await typeInto(page, page.getByLabel("Search the catalog"), "hobit");
      await page.getByRole("link", { name: /The Hobbit/ }).first().waitFor();
      await wait(page, 1500);
    },
  },
  {
    id: "borrow",
    title: "Borrow with Undo",
    async run({ page }) {
      await click(page, page.getByRole("link", { name: /The Hobbit/ }).first());
      await page.getByRole("heading", { level: 1, name: "The Hobbit" }).waitFor();
      await settle(page);
      await say(page, "Availability is computed from copies, open loans and holds. It's never stored.");
      const book = page.locator("article");
      const returnButton = book.getByRole("button", { name: "Return" });
      if (await returnButton.isVisible()) {
        await click(page, returnButton);
        await book.getByRole("button", { name: /Borrow · due/ }).waitFor();
      }
      await click(page, book.getByRole("button", { name: /Borrow · due/ }));
      await page.getByText(/Borrowed “The Hobbit”/).waitFor();
      await say(page, "Borrowing is instant. The book row is locked, so two people can't take the last copy.");
      await click(page, page.getByRole("button", { name: "Undo" }));
      await page.getByText("Loan undone").waitFor();
      await say(page, "Every borrow and return has Undo, for the slip of a finger.");
    },
  },
  {
    id: "filters",
    title: "Filters in the URL",
    async run({ page }) {
      await click(page, nav(page, "Catalog"));
      await page.getByRole("heading", { name: "What are you reading next?" }).waitFor();
      await settle(page);
      await say(page, "Filters live in the URL, so any search can be shared or bookmarked.");
      await click(page, page.getByRole("button", { name: "Available now" }));
      await click(page, page.getByRole("button", { name: "Any genre" }));
      await click(page, page.getByRole("menuitem", { name: "Mystery" }));
      await settle(page);
      await wait(page, 1500);
    },
  },
  {
    id: "vibe",
    title: "Search by vibe",
    when: ({ ai }) => ai,
    async run({ page }) {
      await page.goto(`${BASE}/`);
      await settle(page);
      await say(page, "Search by vibe ranks every book by meaning, using Gemini embeddings and pgvector.");
      await click(page, page.getByRole("button", { name: "Search by vibe" }));
      await typeInto(page, page.getByLabel("Search the catalog"), "cozy mystery set in Japan");
      await page.getByText("Sorted by meaning").waitFor({ timeout: 20_000 });
      await settle(page);
      await wait(page, 2500);
    },
  },
  {
    id: "ask",
    title: "Ask the Librarian",
    when: ({ ai }) => ai,
    async run({ page }) {
      const chat = page.getByRole("region", { name: "Ask the Librarian" });
      await click(page, chat.getByRole("button", { name: "New chat" }));
      await say(page, "Ask the Librarian can search, check what's on the shelf, hold, borrow and renew.");
      await typeInto(page, page.locator("#chat-input-column"), "Something short and funny I can borrow today");
      await page.keyboard.press("Enter");
      const confirm = chat.getByRole("button", { name: /^(Borrow|Place hold|Renew)$/ }).first();
      const proposed = await confirm
        .waitFor({ timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
      await settle(page);
      if (proposed) {
        await say(page, "Anything that changes data comes back as a card. Nothing happens until you press it.");
        await click(page, confirm);
        await chat.getByRole("status").last().waitFor({ timeout: 20_000 });
        await wait(page, 2500);
      } else {
        await wait(page, 4000);
      }
    },
  },
  {
    id: "ai-off",
    title: "Without an AI key",
    when: ({ ai }) => !ai,
    async run({ page }) {
      await pointAt(page, page.getByRole("region", { name: "Ask the Librarian" }));
      await say(page, "This copy has no AI key, so the chat and vibe search switch themselves off. Everything else works.");
    },
  },
  {
    id: "loans",
    title: "My loans",
    async run({ page }) {
      await click(page, nav(page, "My loans"));
      await page.getByRole("region", { name: /On loan/ }).waitFor();
      await settle(page);
      await say(page, "My loans: due dates, overdue badges, and one renewal if nobody is waiting.");
      await pointAt(page, page.getByRole("region", { name: /On loan/ }).getByRole("button", { name: "Renew" }).first());
      await wait(page, 1500);
    },
  },
  {
    id: "switch",
    title: "Switching roles",
    async run({ page }) {
      await say(page, "The account switcher changes the real session, so the server enforces each role.");
      await switchAccount(page, "Leo Brandt", "Librarian");
    },
  },
  {
    id: "dashboard",
    title: "Librarian dashboard",
    async run({ page }) {
      await click(page, nav(page, "Dashboard"));
      await page.waitForURL(`${BASE}/admin`);
      await settle(page);
      await say(page, "Librarians get a dashboard: loans per day, most borrowed, the overdue list and recent activity.");
      await scrollMain(page, 520);
      await wait(page, 2000);
    },
  },
  {
    id: "add-book",
    title: "Add a book by ISBN",
    async run({ page, ai }) {
      await click(page, nav(page, "Add books"));
      await page.locator("#isbn-lookup").waitFor();
      await settle(page);
      await say(page, "Add a book by ISBN, or scan the barcode with a phone. Open Library fills in the rest.");
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
      await wait(page, 2500);
      if (ai) {
        await click(page, page.getByRole("link", { name: "From a shelf photo" }));
        await settle(page);
        await say(page, "Or photograph a shelf: Gemini reads the spines, and you review every match before importing.");
      }
    },
  },
  {
    id: "outbox",
    title: "Email outbox",
    async run({ page }) {
      await click(page, nav(page, "Outbox"));
      await page.waitForURL(`${BASE}/admin/outbox`);
      await settle(page);
      await say(page, "A daily job sends due-soon and overdue reminders. Every email also lands in this Outbox.");
      await click(page, page.locator("main li button").first());
      const preview = page.getByRole("dialog");
      await preview.waitFor();
      await wait(page, 3000);
      // Escape would go to the email's iframe, so close with the button.
      await click(page, preview.getByRole("button", { name: "Close" }));
      await preview.waitFor({ state: "hidden" });
    },
  },
  {
    id: "admin",
    title: "Roles for admins",
    async run({ page }) {
      await switchAccount(page, "Ada Okafor", "Admin");
      await click(page, nav(page, "Users"));
      await page.waitForURL(`${BASE}/admin/users`);
      await settle(page);
      await say(page, "Admins manage roles. In the demo, staff can only change demo accounts.");
      await click(page, page.getByRole("combobox", { name: "Role for Sam Rivera" }));
      await click(page, page.getByRole("option", { name: "Librarian" }));
      await page.getByText("Sam Rivera is now a Librarian").waitFor();
      await wait(page, 2000);
    },
  },
  {
    id: "outro",
    title: "Wrap-up",
    async run({ page }) {
      await click(page, nav(page, "Catalog"));
      await settle(page);
      await say(page, "Next.js, Postgres with pgvector and pg_trgm, Auth.js, Gemini. Open source under MIT.");
      await wait(page, 1500);
    },
  },
];

// ── Helpers used by the steps ───────────────────────────────────────────────

const wait = (page: Page, ms: number) => page.waitForTimeout(ms * PACE);

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await wait(page, 400);
}

function setCaption(page: Page, text: string) {
  return CAPTIONS ? page.evaluate((t) => window.__walkthrough?.caption(t), text) : Promise.resolve();
}

/** Shows a caption long enough to read it. */
async function say(page: Page, text: string) {
  console.log(`  “${text}”`);
  await setCaption(page, text);
  await wait(page, 1400 + text.length * 38);
}

/** Glides the visible pointer to an element, the way a person would move the mouse. */
async function pointAt(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  await wait(page, 250);
}

async function click(page: Page, target: Locator) {
  await pointAt(page, target);
  await target.click();
  await wait(page, 350);
}

async function typeInto(page: Page, target: Locator, text: string) {
  await click(page, target);
  await target.pressSequentially(text, { delay: 75 * PACE });
  await wait(page, 500);
}

function nav(page: Page, label: string) {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: new RegExp(`^${label}`) });
}

async function switchAccount(page: Page, name: string, role: string) {
  await click(page, page.getByRole("button", { name: /Open account menu/ }));
  await click(page, page.getByRole("menuitem", { name: new RegExp(name) }));
  await page.getByRole("button", { name: /Open account menu/ }).filter({ hasText: role }).waitFor();
  await settle(page);
}

/** Scrolls the page in small wheel steps so the motion reads smoothly on video. */
async function scrollMain(page: Page, pixels: number) {
  const box = await page.locator("main").boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  for (let moved = 0; moved < pixels; moved += 40) {
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(25);
  }
}

// ── In-page overlay: caption bar and a visible pointer ──────────────────────

declare global {
  interface Window {
    __walkthrough?: { caption: (text: string) => void };
  }
}

/**
 * Injected into every page. Kept as plain JavaScript in a string because the TypeScript
 * loader rewrites functions in ways that break when Playwright sends them to the browser.
 * Drawn in a shadow root so the app's CSS can't touch it, and never catches clicks.
 */
const OVERLAY_SCRIPT = `(() => {
  const KEY_CAPTION = "walkthrough:caption";
  const KEY_POINTER = "walkthrough:pointer";
  let root = null;

  function ensure() {
    if (root && root.host.isConnected) return root;
    if (!document.body) return null;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    document.body.append(host);
    root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" +
      ".bar{position:fixed;top:0;left:0;right:0;height:48px;display:flex;align-items:center;justify-content:center;" +
      "padding:0 24px;background:#1c1917;color:#fff;font:600 18px/1.2 'Plus Jakarta Sans',system-ui,sans-serif;" +
      "letter-spacing:-0.01em}" +
      ".bar:empty{display:none}" +
      ".pointer{position:fixed;left:0;top:0;width:26px;height:26px}" +
      ".ring{position:absolute;left:-16px;top:-16px;width:36px;height:36px;border-radius:50%;" +
      "background:rgba(79,70,229,.35);opacity:0}" +
      ".ring.on{animation:ring 420ms ease-out}" +
      "@keyframes ring{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}" +
      "</style>" +
      "<div class='bar'></div>" +
      "<div class='pointer'><div class='ring'></div>" +
      "<svg width='26' height='26' viewBox='0 0 26 26'><path d='M3 2l18 10-8 2-4 8z' fill='#1c1917' " +
      "stroke='#fff' stroke-width='2' stroke-linejoin='round'/></svg></div>";
    root.querySelector(".bar").textContent = sessionStorage.getItem(KEY_CAPTION) || "";
    const [x, y] = (sessionStorage.getItem(KEY_POINTER) || "-50,-50").split(",");
    root.querySelector(".pointer").style.transform = "translate(" + x + "px," + y + "px)";
    return root;
  }

  window.__walkthrough = {
    caption(text) {
      sessionStorage.setItem(KEY_CAPTION, text);
      const r = ensure();
      if (r) r.querySelector(".bar").textContent = text;
    },
  };
  addEventListener("load", () => setTimeout(ensure, 50));
  addEventListener("mousemove", (event) => {
    sessionStorage.setItem(KEY_POINTER, event.clientX + "," + event.clientY);
    const r = ensure();
    if (r) r.querySelector(".pointer").style.transform = "translate(" + event.clientX + "px," + event.clientY + "px)";
  }, true);
  addEventListener("mousedown", () => {
    const r = ensure();
    if (!r) return;
    const ring = r.querySelector(".ring");
    ring.classList.remove("on");
    void ring.offsetWidth; // restart the animation
    ring.classList.add("on");
  }, true);
})();`;

// ── Recording: Chrome's screencast frames → ffmpeg ──────────────────────────
// Sharper than Playwright's built-in video (fixed low bitrate): frames are captured
// at 2x pixel density, then encoded once with x264.

async function startRecorder(page: Page) {
  const dir = mkdtempSync(join(tmpdir(), "shelfwise-video-"));
  const frames: { file: string; at: number }[] = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", (frame) => {
    const file = join(dir, `${String(frames.length).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    frames.push({ file, at: Date.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: VIDEO.width,
    maxHeight: VIDEO.height,
  });
  return {
    /** Stops, encodes to `output`, and returns when the video's first frame was captured (epoch seconds). */
    async stop(output: string): Promise<number> {
      await cdp.send("Page.stopScreencast");
      const end = Date.now() / 1000;
      if (frames.length === 0) throw new Error("No frames were captured.");
      // Each frame stays on screen until the next one arrives (Chrome only sends frames on change).
      const list = ["ffconcat version 1.0"];
      frames.forEach((frame, i) => {
        const next = frames[i + 1]?.at ?? end;
        list.push(`file '${frame.file}'`, `duration ${Math.max(next - frame.at, 0.001).toFixed(3)}`);
      });
      list.push(`file '${frames.at(-1)!.file}'`);
      const listFile = join(dir, "frames.txt");
      writeFileSync(listFile, list.join("\n"));
      const { width: w, height: h } = VIDEO;
      ffmpeg([
        "-f", "concat", "-safe", "0", "-i", listFile,
        "-vf", `fps=30,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", output,
      ]);
      rmSync(dir, { recursive: true, force: true });
      return frames[0]!.at;
    },
  };
}

function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
}

function timestamp(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ── Demo bookkeeping, off camera ────────────────────────────────────────────

/** Puts back what the tour changes (Sam's role), so the next run starts the same way. */
async function restoreDemo(browser: Browser) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.getByRole("button", { name: /Continue as Admin/ }).click();
  await page.waitForURL(`${BASE}/`);
  await page.goto(`${BASE}/admin/users`);
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

// ── Run ─────────────────────────────────────────────────────────────────────

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("ffmpeg is required: brew install ffmpeg (macOS) or apt install ffmpeg (Linux).");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch({
  headless: !HEADED,
  args: HEADED ? [`--window-size=${VIEWPORT.width},${VIEWPORT.height + 90}`] : [],
});
await restoreDemo(browser);

const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
await context.addInitScript({ content: OVERLAY_SCRIPT });
const page = await context.newPage();
await page.goto(`${BASE}/sign-in`);
await settle(page);
await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 120);

const ctx: Ctx = { page, ai: false };
const recorder = await startRecorder(page);
const steps: { id: string; title: string; start: number; end: number }[] = [];
const now = () => Date.now() / 1000;

for (const step of STEPS) {
  if (step.when && !step.when(ctx)) continue;
  console.log(`▶ ${step.title}`);
  const start = now();
  await setCaption(page, "\u00a0"); // blank the bar so the last step's caption doesn't linger
  try {
    await step.run(ctx);
  } catch (error) {
    console.error(`\n✗ Step "${step.id}" failed. Nothing was saved.\n`);
    await browser.close();
    throw error;
  }
  steps.push({ id: step.id, title: step.title, start, end: now() });
}

const video = join(OUT_DIR, "shelfwise-walkthrough.mp4");
console.log("Encoding…");
const firstFrameAt = await recorder.stop(video);
const chapters = steps.map((step) => ({
  ...step,
  start: Math.max(step.start - firstFrameAt, 0),
  end: step.end - firstFrameAt,
}));
await context.close();
await restoreDemo(browser);
await browser.close();

writeFileSync(
  join(OUT_DIR, "chapters.txt"),
  chapters.map((c) => `${timestamp(c.start)} ${c.title}`).join("\n") + "\n",
);

if (GIF_STEP) {
  const chapter = chapters.find((c) => c.id === GIF_STEP);
  if (!chapter) console.warn(`No step "${GIF_STEP}" in this run. Steps: ${chapters.map((c) => c.id).join(", ")}`);
  else {
    const gif = join(OUT_DIR, `shelfwise-${chapter.id}.gif`);
    ffmpeg([
      "-ss", chapter.start.toFixed(2), "-to", chapter.end.toFixed(2), "-i", video,
      "-vf", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
      gif,
    ]);
    console.log(`✓ GIF: ${gif}`);
  }
}

console.log(`✓ Video: ${video} (${timestamp(chapters.at(-1)?.end ?? 0)})`);
console.log(`✓ Chapters: ${join(OUT_DIR, "chapters.txt")}`);
