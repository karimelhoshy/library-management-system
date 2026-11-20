import { ArrowLeftRight, BellRing, BookPlus, Pencil, RefreshCw, Trash2, Undo2, UserCog, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { describeActivity, type ActivityItem } from "@/server/services/activity";

const ICONS: Record<string, LucideIcon> = {
  "book.created": BookPlus,
  "book.updated": Pencil,
  "book.deleted": Trash2,
  "book.copies_added": BookPlus,
  "loan.borrowed": ArrowLeftRight,
  "loan.returned": Undo2,
  "loan.renewed": RefreshCw,
  "hold.placed": BellRing,
  "hold.ready": BellRing,
  "user.role_changed": UserCog,
  "import.completed": BookPlus,
};

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(date: Date, now = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86_400), "day");
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-[15px] text-ink-2">Nothing has happened yet. Borrow a book to get things going.</p>;
  }
  const now = new Date();
  return (
    <ol className="flex flex-col">
      {items.map((item) => {
        const Icon = ICONS[item.action] ?? Pencil;
        const bookId = typeof item.metadata.bookId === "string" ? item.metadata.bookId : null;
        const text = describeActivity(item);
        return (
          <li key={item.id} className="flex gap-3 border-b border-border py-2.5 last:border-0">
            <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-ink-2">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] leading-snug">
                {bookId && item.action !== "book.deleted" ? (
                  <Link href={`/books/${bookId}`} className="hover:text-accent-foreground hover:underline">
                    {text}
                  </Link>
                ) : (
                  text
                )}
              </p>
              <p className="text-[13px] text-ink-3">
                <time dateTime={item.createdAt.toISOString()}>{timeAgo(item.createdAt, now)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
