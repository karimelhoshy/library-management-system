"use client";

import { useState } from "react";
import { cn } from "cn";

/** Deep, readable cover colours for books without an image (white text passes AA on all). */
const FALLBACK_COLORS = ["#1E3A8A", "#7F1D1D", "#9A3412", "#115E59", "#78350F", "#334155", "#4C1D95", "#14532D"];

function colorFor(title: string): string {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]!;
}

/**
 * Book cover with a graceful fallback: a solid colour block with the title,
 * used when there's no cover URL or the image fails to load.
 */
export function BookCover({
  title,
  coverUrl,
  className,
  size = "md",
  priority = false,
}: {
  title: string;
  coverUrl: string | null;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = coverUrl && !failed;
  // `?default=false` makes Open Library return 404 (not a blank pixel) when it has no cover.
  const src = coverUrl?.includes("covers.openlibrary.org") && !coverUrl.includes("?")
    ? `${coverUrl}?default=false`
    : coverUrl;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[6px] shadow-cover",
        size === "xs" && "h-12 w-8 rounded-[4px]",
        size === "sm" && "h-[72px] w-12",
        size === "md" && "h-[108px] w-[72px]",
        size === "lg" && "aspect-[2/3] w-[200px] rounded-[10px]",
        className,
      )}
      style={{ backgroundColor: colorFor(title) }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote covers; plain img keeps the fallback simple
        <img
          src={src!}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        size !== "xs" &&
        size !== "sm" && (
          <span
            className={cn(
              "absolute inset-x-0 top-0 line-clamp-4 p-2 text-left font-extrabold leading-tight tracking-[-0.02em] text-white",
              size === "lg" ? "p-4 text-xl" : "text-[10px]",
            )}
          >
            {title}
          </span>
        )
      )}
    </div>
  );
}
