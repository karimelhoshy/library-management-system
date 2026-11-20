import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/config";

export const alt = `${APP_NAME}: a library system with a librarian built in`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COVERS = ["#1E3A8A", "#7F1D1D", "#9A3412", "#115E59", "#4C1D95"];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#FAFAF7",
          padding: 72,
          fontFamily: "sans-serif",
          color: "#1C1917",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: 999, background: "#4F46E5", display: "flex" }} />
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.5 }}>{APP_NAME}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02, maxWidth: 640 }}>
              What are you reading next?
            </div>
            <div style={{ fontSize: 30, color: "#57534E", maxWidth: 620 }}>
              Search, borrow and return books, place holds, and ask an AI librarian.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 18, paddingBottom: 8 }}>
          {COVERS.map((color, i) => (
            <div
              key={color}
              style={{
                width: 72,
                height: 300 - (i % 3) * 36,
                background: color,
                borderRadius: 10,
                boxShadow: "0 6px 14px rgba(28,25,23,.15)",
                display: "flex",
              }}
            />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
