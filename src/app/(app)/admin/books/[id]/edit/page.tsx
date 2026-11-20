import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookForm, bookToValues } from "@/components/admin/book-form";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/server/auth/session";
import { getBook } from "@/server/services/books";

export const metadata: Metadata = { title: "Edit book" };

export default async function EditBookPage({ params }: PageProps<"/admin/books/[id]/edit">) {
  await requirePermission("book:write");
  const { id } = await params;
  const book = await getBook(id);
  if (!book) notFound();
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-5 md:px-8 md:py-8">
      <Link
        href={`/books/${book.id}`}
        className="mb-4 inline-flex items-center gap-1 text-[15px] font-semibold text-ink-2 hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden /> {book.title}
      </Link>
      <PageHeader title="Edit book" description="Changes are saved to the catalog and logged." />
      <BookForm mode="edit" bookId={book.id} initial={bookToValues(book)} />
    </div>
  );
}
