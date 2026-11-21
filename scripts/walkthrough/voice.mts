/**
 * The voiceover: every narration line is spoken by Gemini's text-to-speech before recording
 * starts, so the tour can wait for each line to finish. After recording, the clips are placed
 * at the moments their captions appeared and mixed into the video's audio track.
 * Clips are cached in recordings/.voice-cache, so a re-run only pays for lines that changed.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";
import { OUT_DIR, TTS_MODEL, VOICE_STYLE } from "./config.mjs";
import { durationOf, ffmpeg } from "./media.mjs";

export type Clip = { file: string; seconds: number };

const CACHE_DIR = join(OUT_DIR, ".voice-cache");

export function voiceAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** One line of narration as WAV bytes (24 kHz mono). */
async function speak(ai: GoogleGenAI, text: string, voice: string): Promise<Buffer> {
  const interaction = await ai.interactions.create({
    model: TTS_MODEL,
    input: [
      {
        type: "user_input",
        content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: VOICE_STYLE }] }],
      },
    ],
    response_format: { type: "audio" },
    generation_config: { speech_config: [{ voice }] },
  });
  const data = interaction.output_audio?.data;
  if (!data) throw new Error(`Gemini returned no audio for "${text}"`);
  return Buffer.from(data, "base64");
}

/**
 * Waits out per-minute rate limits and server hiccups (up to about four minutes). A daily
 * quota can't be waited out, so it stops with a short explanation; finished lines stay cached.
 */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const { status, statusCode, message = "" } = error as { status?: number; statusCode?: number; message?: string };
      const code = status ?? statusCode ?? 0;
      if (code === 429 && /per day/i.test(message)) {
        throw new Error(`Gemini's daily voice quota is used up. Lines made so far are cached, so the next run only asks for the rest.\n  ${message}`);
      }
      if (attempt >= 7 || (code !== 429 && code < 500)) throw error;
      const seconds = Math.min(5 * 2 ** (attempt - 1), 60);
      console.log(`  Gemini answered ${code}; trying again in ${seconds}s…`);
      await new Promise((done) => setTimeout(done, seconds * 1000));
    }
  }
}

/** Speaks every line up front (two at a time, cached) and returns each clip with its length. */
export async function synthesize(lines: string[], voice: string): Promise<Map<string, Clip>> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: "v1beta" } });
  mkdirSync(CACHE_DIR, { recursive: true });
  const unique = [...new Set(lines)];
  const clips = new Map<string, Clip>();
  let next = 0;
  let made = 0;
  const worker = async () => {
    while (next < unique.length) {
      const text = unique[next++]!;
      const key = createHash("sha256").update([TTS_MODEL, voice, VOICE_STYLE, text].join("\n")).digest("hex");
      const file = join(CACHE_DIR, `${key.slice(0, 16)}.wav`);
      if (!existsSync(file)) {
        writeFileSync(file, await withRetry(() => speak(ai, text, voice)));
        made++;
      }
      clips.set(text, { file, seconds: durationOf(file) });
    }
  };
  await Promise.all(Array.from({ length: 2 }, worker));
  console.log(`  ${made} new, ${unique.length - made} from the cache.`);
  return clips;
}

/** Copies the video and adds one audio track with each clip starting at its offset (seconds). */
export function addVoiceTrack(video: string, clips: { file: string; at: number }[], output: string) {
  const inputs = clips.flatMap((clip) => ["-i", clip.file]);
  const delayed = clips.map((clip, i) => `[${i + 1}:a]adelay=${Math.round(clip.at * 1000)}:all=1[v${i}]`);
  // Mix without ducking, then even out the level to the usual -16 LUFS for online video.
  const mix = `${clips.map((_, i) => `[v${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11[voice]`;
  ffmpeg([
    "-i", video, ...inputs,
    "-filter_complex", [...delayed, mix].join(";"),
    "-map", "0:v", "-map", "[voice]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart",
    output,
  ]);
}
