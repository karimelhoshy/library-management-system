import { Info } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="flex h-8 shrink-0 items-center justify-center gap-2 border-b border-accent-border/60 bg-accent px-4 text-[13px] font-medium text-accent-foreground">
      <Info className="size-3.5" aria-hidden />
      <span>
        <strong className="font-bold">Demo mode:</strong> data resets nightly
      </span>
    </div>
  );
}
