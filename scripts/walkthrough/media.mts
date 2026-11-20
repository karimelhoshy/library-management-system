/** Thin wrappers over ffmpeg/ffprobe, plus time formatting for chapters and subtitles. */
import { execFileSync } from "node:child_process";

export function hasCommand(command: string, versionFlag = "-version"): boolean {
  try {
    execFileSync(command, [versionFlag], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function ffmpeg(args: string[]) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
}

/** Length of an audio or video file, in seconds. */
export function durationOf(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.toString().trim());
}

/** "1:07", for YouTube-style chapter lists. */
export function chapterTime(seconds: number) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "00:01:07,250", for .srt subtitles. */
export function srtTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
