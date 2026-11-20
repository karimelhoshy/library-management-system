/**
 * Records the page through Chrome's screencast and encodes it with x264. Sharper than
 * Playwright's built-in video (a fixed low bitrate): frames are captured at 2x pixel
 * density and encoded once.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { VIDEO } from "./config.mjs";
import { ffmpeg } from "./media.mjs";

export async function startRecorder(page: Page) {
  const dir = mkdtempSync(join(tmpdir(), "shelfwise-video-"));
  const frames: { file: string; at: number }[] = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on("Page.screencastFrame", (frame) => {
    const file = join(dir, `${String(frames.length).padStart(6, "0")}.jpg`);
    writeFileSync(file, Buffer.from(frame.data, "base64"));
    frames.push({ file, at: Date.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: VIDEO.width, maxHeight: VIDEO.height });

  return {
    /** Stops, encodes to `output`, and returns when the first frame was captured (epoch seconds). */
    async stop(output: string): Promise<number> {
      // Take the end time first: stopping can take seconds, which would freeze the last frame.
      const end = Date.now() / 1000;
      await cdp.send("Page.stopScreencast");
      const kept = frames.filter((frame) => frame.at <= end);
      if (kept.length === 0) throw new Error("No frames were captured.");
      // Each frame stays on screen until the next one arrives (Chrome only sends frames on change).
      const list = ["ffconcat version 1.0"];
      kept.forEach((frame, i) => {
        const next = kept[i + 1]?.at ?? end;
        list.push(`file '${frame.file}'`, `duration ${Math.max(next - frame.at, 0.001).toFixed(3)}`);
      });
      list.push(`file '${kept.at(-1)!.file}'`);
      const listFile = join(dir, "frames.txt");
      writeFileSync(listFile, list.join("\n"));
      const { width: w, height: h } = VIDEO;
      ffmpeg([
        "-f", "concat", "-safe", "0", "-i", listFile,
        "-vf", `fps=30,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart",
        // The repeated last frame is needed by older ffmpeg but doubles the final shot in newer ones; -t settles it.
        "-t", (end - kept[0]!.at).toFixed(3),
        output,
      ]);
      rmSync(dir, { recursive: true, force: true });
      return kept[0]!.at;
    },
  };
}
