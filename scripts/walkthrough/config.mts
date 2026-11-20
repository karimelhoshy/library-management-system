import { resolve } from "node:path";

/** Every setting comes from an environment variable, so one script works locally and against the live demo. */
export const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
/** Multiplies every pause; 1.5 gives you room to talk over a HEADED run. */
export const PACE = Number(process.env.PACE ?? 1);
export const HEADED = process.env.HEADED === "1";
export const CAPTIONS = process.env.CAPTIONS !== "0";
/** A macOS voice for the voiceover (`say -v '?'` lists them), or "off". */
export const VOICE = process.env.VOICE ?? "Samantha";
/** A step id to also export as a GIF. */
export const GIF_STEP = process.env.GIF;

export const OUT_DIR = resolve("recordings");
export const VIEWPORT = { width: 1600, height: 900 };
export const VIDEO = { width: 1920, height: 1080 };
