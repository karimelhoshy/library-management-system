"use client";

import {
  ArrowLeftRight,
  ChartLine,
  Clock,
  History,
  LayoutGrid,
  Mail,
  MessageSquare,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { useChat } from "@/components/chat/chat-provider";

export type NavCounts = { overdue: number; holdsReady: number };

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: { text: string; tone: "danger" | "accent" } | null;
};

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function loansBadge(counts: NavCounts): NavItem["badge"] {
  if (counts.overdue > 0) return { text: `${counts.overdue} overdue`, tone: "danger" };
  if (counts.holdsReady > 0) return { text: `${counts.holdsReady} ready`, tone: "accent" };
  return null;
}

export function SidebarNav({
  counts,
  showDesk,
  showUsers,
}: {
  counts: NavCounts;
  showDesk: boolean;
  showUsers: boolean;
}) {
  const pathname = usePathname();
  const chat = useChat();

  const main: NavItem[] = [
    { href: "/", label: "Catalog", icon: LayoutGrid, exact: true },
    { href: "/loans", label: "My loans", icon: Clock, badge: loansBadge(counts) },
    { href: "/ask", label: "Ask the Librarian", icon: MessageSquare },
  ];
  const desk: NavItem[] = [
    { href: "/admin", label: "Dashboard", icon: ChartLine, exact: true },
    { href: "/admin/books/new", label: "Add books", icon: Plus },
    { href: "/admin/loans", label: "Loans desk", icon: ArrowLeftRight },
    { href: "/admin/outbox", label: "Outbox", icon: Mail },
    { href: "/admin/activity", label: "Activity", icon: History },
    ...(showUsers ? [{ href: "/admin/users", label: "Users", icon: Users }] : []),
  ];

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item) || (item.href === "/" && pathname.startsWith("/books/"));
    const Icon = item.icon;
    const onClick =
      item.href === "/ask"
        ? (event: React.MouseEvent) => {
            // On wide screens the chat lives in the right column: open it instead of navigating.
            if (chat.columnAvailable()) {
              event.preventDefault();
              chat.openColumn();
            }
          }
        : undefined;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onClick}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-ink-2 transition-colors hover:bg-muted hover:text-foreground",
            active && "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.25 : 2} aria-hidden />
          <span className="truncate">{item.label}</span>
          {item.badge && (
            <span
              className={cn(
                "ml-auto rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap",
                item.badge.tone === "danger" ? "bg-destructive-bg text-destructive" : "bg-accent text-accent-foreground",
              )}
            >
              {item.badge.text}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      <ul className="flex flex-col gap-1">{main.map(renderItem)}</ul>
      {showDesk && (
        <div>
          <p className="mb-2 px-3 text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Library desk</p>
          <ul className="flex flex-col gap-1">{desk.map(renderItem)}</ul>
        </div>
      )}
    </nav>
  );
}
