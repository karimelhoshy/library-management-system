import { BookMarked } from "lucide-react";
import { cn } from "cn";
import { APP_NAME } from "@/lib/config";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-primary text-white", className)}
    >
      <BookMarked className="size-[18px]" strokeWidth={2.25} />
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[19px] font-extrabold tracking-[-0.02em] text-foreground">{APP_NAME}</span>
    </span>
  );
}
