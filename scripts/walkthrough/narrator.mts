/**
 * Shows each line as a caption and keeps time: with a voiceover, a line lasts as long as
 * its clip; without one, as long as it takes to read. Lines never overlap.
 */
import type { Page } from "@playwright/test";
import { PACE } from "./config.mjs";
import { srtTime } from "./media.mjs";
import { setCaption } from "./overlay.mjs";
import type { ToVideoTime } from "./recorder.mjs";
import type { Clip } from "./voice.mjs";

export type SpokenLine = { text: string; start: number; end: number; clip?: Clip };

const GAP_SECONDS = 0.35;

function readingSeconds(text: string) {
  return 1.4 + text.length * 0.038;
}

export function createNarrator(page: Page, clips: Map<string, Clip> | null) {
  const spoken: SpokenLine[] = [];
  let busyUntil = 0;

  /** Waits until the current line has finished. */
  async function finish() {
    const left = busyUntil - Date.now();
    if (left > 0) await page.waitForTimeout(left);
  }

  /**
   * Shows (and speaks) a line. By default waits for it to end; pass `{ wait: false }`
   * to carry on with clicks while it plays.
   */
  async function say(text: string, { wait = true }: { wait?: boolean } = {}) {
    await finish();
    console.log(`  “${text}”`);
    const clip = clips?.get(text);
    const seconds = clip ? clip.seconds : readingSeconds(text) * PACE;
    await setCaption(page, text);
    const start = Date.now() / 1000;
    spoken.push({ text, start, end: start + seconds, clip });
    busyUntil = Date.now() + (seconds + GAP_SECONDS * PACE) * 1000;
    if (wait) await finish();
  }

  return { say, finish, spoken };
}

/** Subtitles for the video, timed against the finished video. */
export function toSrt(lines: SpokenLine[], toVideoTime: ToVideoTime) {
  return lines
    .map((line, i) => `${i + 1}\n${srtTime(toVideoTime(line.start))} --> ${srtTime(toVideoTime(line.end))}\n${line.text}\n`)
    .join("\n");
}
