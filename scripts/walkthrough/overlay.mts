import type { Page } from "@playwright/test";
import { CAPTIONS } from "./config.mjs";

declare global {
  interface Window {
    __walkthrough?: { caption: (text: string) => void };
  }
}

/**
 * Injected into every page: a caption bar across the top and a visible mouse pointer
 * (screen recordings don't include the real one). Drawn in a shadow root so the app's
 * CSS can't touch it, and it never catches clicks.
 *
 * Kept as plain JavaScript in a string because the TypeScript loader rewrites functions
 * in ways that break when Playwright sends them to the browser.
 */
export const OVERLAY_SCRIPT = `(() => {
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

/** Sets the caption bar. A non-breaking space shows an empty bar. */
export function setCaption(page: Page, text: string) {
  return CAPTIONS ? page.evaluate((t) => window.__walkthrough?.caption(t), text) : Promise.resolve();
}
