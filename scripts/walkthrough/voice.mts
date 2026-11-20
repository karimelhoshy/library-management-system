/**
 * The voiceover: each narration line is spoken with macOS `say` before recording starts,
 * so the tour can wait for every line to finish. After recording, the clips are placed at
 * the moments their captions appeared and mixed into the video's audio track.
 * To use a cloud voice instead, replace `speak()`; nothing else depends on `say`.
 */
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { durationOf, ffmpeg, hasCommand } from "./media.mjs";

export type Clip = { file: string; seconds: number };

/** Words the voice gets wrong as written. Captions keep the real spelling. */
const PRONUNCIATION: [RegExp, string][] = [
  [/Next\.js/g, "Next J S"],
  [/Auth\.js/g, "Auth J S"],
  [/\bISBN\b/g, "I S B N"],
  [/…/g, ", "],
];

export function voiceAvailable(): boolean {
  return process.platform === "darwin" && hasCommand("say", "-v?");
}

function speakable(text: string) {
  return PRONUNCIATION.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

async function speak(text: string, voice: string, file: string) {
  await promisify(execFile)("say", ["-v", voice, "-o", file, speakable(text)]);
}

/** Speaks every line up front (a few at a time) and returns each clip with its length. */
export async function synthesize(lines: string[], voice: string, dir: string): Promise<Map<string, Clip>> {
  const unique = [...new Set(lines)];
  const clips = new Map<string, Clip>();
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const index = next++;
      const text = unique[index]!;
      const file = join(dir, `line-${String(index).padStart(3, "0")}.aiff`);
      await speak(text, voice, file);
      clips.set(text, { file, seconds: durationOf(file) });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return clips;
}

/** Copies the video and adds one audio track with each clip starting at its offset (seconds). */
export function addVoiceTrack(video: string, clips: { file: string; at: number }[], output: string) {
  const inputs = clips.flatMap((clip) => ["-i", clip.file]);
  const delayed = clips.map((clip, i) => `[${i + 1}:a]adelay=${Math.round(clip.at * 1000)}:all=1[v${i}]`);
  const mix = `${clips.map((_, i) => `[v${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:dropout_transition=0[voice]`;
  ffmpeg([
    "-i", video, ...inputs,
    "-filter_complex", [...delayed, mix].join(";"),
    "-map", "0:v", "-map", "[voice]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart",
    output,
  ]);
}
