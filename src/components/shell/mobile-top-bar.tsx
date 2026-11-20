"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand";

/** Phone header: logo + account pill. Hidden where a page brings its own header. */
export function MobileTopBar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/books/") || pathname === "/ask") return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-4 md:hidden">
      <Link href="/" aria-label="Catalog">
        <Logo />
      </Link>
      {children}
    </div>
  );
}
