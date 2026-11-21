/**
 * Records a narrated walkthrough of a running Shelfwise instance (demo mode, seeded).
 *
 *   pnpm video                                  # local dev server → recordings/shelfwise-walkthrough.mp4
 *   BASE_URL=https://<your-app> pnpm video      # record the live demo instead
 *   VOICE=Sulafat pnpm video                    # another Gemini voice
 *   HEADED=1 PACE=1.5 CAPTIONS=0 VOICE=off pnpm video   # watch it play while you record your own voice
 *   GIF=borrow pnpm video                       # also export one step as a GIF (ids are in tour.mts)
 *
 * Writes the MP4, .srt subtitles and chapter timestamps to recordings/. Needs ffmpeg; the
 * voiceover needs GEMINI_API_KEY in .env.local. For a clean run locally, `pnpm db:reset`
 * first; the live demo resets nightly.
 *
 *   tour.mts      the steps: narration and clicks        narrator.mts  captions and timing
 *   voice.mts     text to speech and the audio track     recorder.mts  screen capture → MP4
 *   actions.mts   human-paced mouse and keyboard         overlay.mts   caption bar and pointer
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { settle } from "./actions.mjs";
import { BASE_URL, GIF_STEP, HEADED, OUT_DIR, VIEWPORT, VOICE } from "./config.mjs";
import { chapterTime, ffmpeg, hasCommand } from "./media.mjs";
import { createNarrator, toSrt } from "./narrator.mjs";
import { setCaption, OVERLAY_SCRIPT } from "./overlay.mjs";
import { startRecorder } from "./recorder.mjs";
import { restoreDemo, STEPS, type TourState } from "./tour.mjs";
import { addVoiceTrack, synthesize, voiceAvailable, type Clip } from "./voice.mjs";

if (!hasCommand("ffmpeg")) {
  console.error("ffmpeg is required: brew install ffmpeg (macOS) or apt install ffmpeg (Linux).");
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "shelfwise-walkthrough-"));

// 1. Voiceover clips, made before recording so each step can wait for its lines.
let clips: Map<string, Clip> | null = null;
if (VOICE !== "off") {
  if (voiceAvailable()) {
    const lines = STEPS.flatMap((step) => Object.values(step.lines));
    console.log(`Voicing ${lines.length} lines of narration with Gemini's "${VOICE}" voice…`);
    clips = await synthesize(lines, VOICE);
  } else {
    console.warn("No GEMINI_API_KEY in .env.local, so the video gets captions but no voiceover (VOICE=off hides this).");
  }
}

// 2. The tour, recorded.
const browser = await chromium.launch({
  headless: !HEADED,
  args: HEADED ? [`--window-size=${VIEWPORT.width},${VIEWPORT.height + 90}`] : [],
});
await restoreDemo(browser);
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
await context.addInitScript({ content: OVERLAY_SCRIPT });
const page = await context.newPage();
await page.goto(`${BASE_URL}/sign-in`);
await settle(page);
await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height - 120);

const recorder = await startRecorder(page);
const narrator = createNarrator(page, clips);
const state: TourState = { ai: false };
const ran: { id: string; title: string; start: number; end: number }[] = [];
const now = () => Date.now() / 1000;

for (const step of STEPS) {
  if (step.when && !step.when(state)) continue;
  await narrator.finish();
  console.log(`▶ ${step.title}`);
  const start = now();
  await setCaption(page, " "); // blank the bar so the last step's caption doesn't linger
  try {
    await step.run({ page, state, say: (line, options) => narrator.say(step.lines[line]!, options) });
  } catch (error) {
    console.error(`\n✗ Step "${step.id}" failed. Nothing was saved.\n`);
    await browser.close();
    rmSync(work, { recursive: true, force: true });
    throw error;
  }
  ran.push({ id: step.id, title: step.title, start, end: now() });
}
await narrator.finish();

// 3. Encode, then add the voice track.
console.log("Encoding…");
const video = join(OUT_DIR, "shelfwise-walkthrough.mp4");
const silent = clips ? join(work, "silent.mp4") : video;
const videoStart = await recorder.stop(silent);
await context.close();
await restoreDemo(browser);
await browser.close();

if (clips) {
  const voiced = narrator.spoken.filter((line) => line.clip);
  addVoiceTrack(silent, voiced.map((line) => ({ file: line.clip!.file, at: Math.max(line.start - videoStart, 0) })), video);
}
rmSync(work, { recursive: true, force: true });

// 4. Subtitles, chapters and the optional GIF.
const chapters = ran.map((c) => ({ ...c, start: Math.max(c.start - videoStart, 0), end: c.end - videoStart }));
writeFileSync(join(OUT_DIR, "shelfwise-walkthrough.srt"), toSrt(narrator.spoken, videoStart));
writeFileSync(join(OUT_DIR, "chapters.txt"), chapters.map((c) => `${chapterTime(c.start)} ${c.title}`).join("\n") + "\n");

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

console.log(`✓ Video: ${video} (${chapterTime(chapters.at(-1)?.end ?? 0)}${clips ? ", with voiceover" : ""})`);
console.log(`✓ Subtitles and chapters in ${OUT_DIR}`);
