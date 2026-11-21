import { resolve } from "node:path";

/** Every setting comes from an environment variable, so one script works locally and against the live demo. */
export const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** Multiplies every pause; 1.5 gives you room to talk over a HEADED run. */
export const PACE = Number(process.env.PACE ?? 1);
export const HEADED = process.env.HEADED === "1";
export const CAPTIONS = process.env.CAPTIONS !== "0";
/** A Gemini voice for the voiceover (names are in Gemini's text-to-speech docs), or "off". */
export const VOICE = process.env.VOICE ?? "Aoede";
/** How the narrator sounds across every line. Keep it short; long directions make the voice drift. */
export const VOICE_STYLE = process.env.VOICE_STYLE ?? "relaxed, friendly and conversational";
export const TTS_MODEL = process.env.TTS_MODEL ?? "gemini-3.8-flash-tts";
/** A step id to also export as a GIF. */
export const GIF_STEP = process.env.GIF;

export const OUT_DIR = resolve("recordings");
export const VIEWPORT = { width: 1600, height: 900 };
export const VIDEO = { width: 1920, height: 1080 };
