import { Barcode, Camera } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { BookForm } from "@/components/admin/book-form";
import { ShelfImport } from "@/components/admin/shelf-import";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/server/auth/session";
import { isAiEnabled } from "@/server/env";

export const metadata: Metadata = { title: "Add books" };

export default async function AddBooksPage({ searchParams }: PageProps<"/admin/books/new">) {
  await requirePermission("book:write");
  const { tab } = await searchParams;
  const photo = tab === "photo";
  const tabs = [
    { href: "/admin/books/new", label: "By ISBN or by hand", icon: Barcode, active: !photo },
    { href: "/admin/books/new?tab=photo", label: "From a shelf photo", icon: Camera, active: photo },
  ];

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader
        title="Add books"
        description={
          photo
            ? "Snap a shelf or a pile of covers. The AI reads the titles, you review and import."
            : "Look up an ISBN, scan a barcode, or fill in the details yourself."
        }
      />
      <nav aria-label="Ways to add books" className="mb-6 flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[15px] font-semibold",
              t.active
                ? "border-foreground bg-foreground text-white"
                : "border-border bg-surface text-foreground hover:bg-muted",
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </Link>
        ))}
      </nav>
      {photo ? <ShelfImport aiEnabled={isAiEnabled()} /> : <BookForm mode="create" />}
    </div>
  );
}
