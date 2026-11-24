import { Sparkles } from "lucide-react";
import { cn } from "cn";
import type { AiUsage } from "@/server/ai/rate-limit";

const KIND_LABEL = { chat: "Librarian chats", vibe: "Vibe searches", vision: "Shelf photos" } as const;

/** AI requests in the last 24 hours against the library's daily budget, and the limits behind it. */
export function AiUsageCard({ usage, models }: { usage: AiUsage; models: string[] }) {
  const share = Math.min(1, usage.total / usage.budget);
  return (
    <section className="rounded-2xl border border-border bg-surface p-5" aria-labelledby="ai-usage-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="ai-usage-title" className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.01em]">
          <Sparkles className="size-4 text-primary" aria-hidden /> AI usage
        </h2>
        <span className="text-[13px] text-ink-3">last 24 hours</span>
      </div>
      <p className="mt-3 text-[15px]">
        <span className="text-[22px] font-extrabold tracking-[-0.02em]">{usage.total}</span>
        <span className="text-ink-2"> of {usage.budget} requests in the daily budget</span>
      </p>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={usage.budget}
        aria-valuenow={usage.total}
        aria-label="Share of the daily AI budget used"
      >
        <div
          className={cn("h-full rounded-full", share >= 0.8 ? "bg-destructive" : "bg-primary")}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((kind) => (
          <li key={kind}>
            {KIND_LABEL[kind]} <span className="font-semibold text-foreground">{usage.byKind[kind]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] text-ink-3">
        Each member also has an hourly limit. If a model is busy or slow, the next one answers: {models.join(" → ")}.
      </p>
    </section>
  );
}
