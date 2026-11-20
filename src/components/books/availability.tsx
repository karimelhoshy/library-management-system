import { cn } from "cn";
import type { AvailabilityTone } from "@/server/services/rules";

export function AvailabilityDot({ tone, className }: { tone: AvailabilityTone | "ready" | "mine"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        tone === "available" && "bg-success-dot",
        tone === "onloan" && "bg-warning-dot",
        (tone === "ready" || tone === "mine") && "bg-primary",
        className,
      )}
    />
  );
}

export function AvailabilityText({
  tone,
  children,
  className,
}: {
  tone: AvailabilityTone | "ready" | "mine";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[13px] font-bold",
        tone === "available" && "text-success",
        tone === "onloan" && "text-warning",
        (tone === "ready" || tone === "mine") && "text-accent-foreground",
        className,
      )}
    >
      <AvailabilityDot tone={tone} />
      {children}
    </span>
  );
}
