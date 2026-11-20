"use client";

import { Clock, LayoutGrid, MessageSquare, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Catalog", icon: LayoutGrid },
  { href: "/loans", label: "Loans", icon: Clock },
  { href: "/ask", label: "Ask", icon: MessageSquare },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function active(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/books/");
  if (href === "/profile") return pathname === "/profile" || pathname.startsWith("/admin");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Bottom tab bar on phones (the sidebar's replacement below 768px). */
export function MobileTabBar({ overdue }: { overdue: number }) {
  const pathname = usePathname();
  // Book detail has its own sticky action bar.
  if (pathname.startsWith("/books/")) return null;
  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const isActive = active(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-ink-3",
                  isActive && "text-primary",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={isActive ? 2.25 : 2} aria-hidden />
                {tab.label}
                {tab.href === "/loans" && overdue > 0 && (
                  <span className="absolute top-2.5 left-[calc(50%+6px)] grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-white">
                    {overdue}
                    <span className="sr-only"> overdue</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
