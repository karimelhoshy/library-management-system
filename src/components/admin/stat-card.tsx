import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: number | string;
  detail?: string;
  icon: LucideIcon;
  tone?: "neutral" | "accent" | "danger";
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-ink-2">{label}</p>
        <span
          aria-hidden
          className={cn(
            "grid size-9 place-items-center rounded-xl",
            tone === "neutral" && "bg-secondary text-ink-2",
            tone === "accent" && "bg-accent text-primary",
            tone === "danger" && "bg-destructive-bg text-destructive",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-[34px] leading-none font-extrabold tracking-[-0.03em]">{value}</p>
      {detail && <p className="mt-1.5 text-[13px] text-ink-3">{detail}</p>}
    </>
  );
  const className =
    "block rounded-2xl border border-border bg-surface p-5 transition-[border-color] hover:border-accent-border";
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
