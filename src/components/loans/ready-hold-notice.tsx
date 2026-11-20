import { BellRing } from "lucide-react";
import Link from "next/link";
import { formatShortDate } from "@/server/services/rules";
import type { MyHold } from "@/server/services/holds";

/** In-app notice for holds that are ready to pick up. */
export function ReadyHoldNotice({ holds }: { holds: MyHold[] }) {
  const ready = holds.filter((hold) => hold.status === "ready");
  if (ready.length === 0) return null;
  return (
    <div
      role="status"
      className="mb-5 flex items-start gap-3 rounded-2xl border border-accent-border bg-accent px-4 py-3 text-accent-foreground"
    >
      <BellRing className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 text-[15px]">
        {ready.map((hold) => (
          <p key={hold.id}>
            Your hold on{" "}
            <Link href={`/books/${hold.bookId}`} className="font-bold underline-offset-2 hover:underline">
              {hold.title}
            </Link>{" "}
            is ready to pick up
            {hold.readyUntil ? ` until ${formatShortDate(hold.readyUntil)}` : ""}.
          </p>
        ))}
      </div>
    </div>
  );
}
