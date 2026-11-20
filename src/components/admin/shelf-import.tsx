"use client";

import { Camera, ImageUp, Loader2, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { BookCover } from "@/components/books/book-cover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { importShelfAction, scanShelfAction } from "@/server/actions/import";
import type { ImportCandidate, ImportItem } from "@/server/services/import";

type Row = ImportCandidate & { selected: boolean; title: string; author: string };

/** Downscale in the browser so uploads stay small and fast (max 1600px, JPEG). */
async function resizeImage(file: File): Promise<{ base64: string; mimeType: string; preview: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg", preview: dataUrl };
}

function statusChip(row: Row) {
  switch (row.match.kind) {
    case "owned":
      return { text: "Add a copy", className: "bg-accent text-accent-foreground" };
    case "new":
      return { text: "New book", className: "bg-success-bg text-success" };
    default:
      return { text: "No match", className: "bg-secondary text-ink-2" };
  }
}

export function ShelfImport({ aiEnabled }: { aiEnabled: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scanning, startScan] = useTransition();
  const [importing, startImport] = useTransition();
  const [done, setDone] = useState<{ created: number; copies: number } | null>(null);

  if (!aiEnabled) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <Sparkles className="mx-auto size-7 text-primary" aria-hidden />
        <p className="mt-3 text-lg font-bold">Shelf-photo import needs AI</p>
        <p className="mx-auto mt-1 max-w-md text-[15px] text-ink-2">
          Add a <code>GEMINI_API_KEY</code> to turn it on. Meanwhile you can still add books by ISBN or by hand.
        </p>
        <Button asChild variant="outline" className="mt-5">
          <Link href="/admin/books/new">Add by ISBN</Link>
        </Button>
      </div>
    );
  }

  const onFile = (file: File | undefined) => {
    if (!file) return;
    setDone(null);
    startScan(async () => {
      try {
        const image = await resizeImage(file);
        setPreview(image.preview);
        setRows(null);
        const result = await scanShelfAction(image.base64, image.mimeType);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setRows(
          result.data.map((candidate) => ({
            ...candidate,
            selected: candidate.match.kind !== "unmatched" && candidate.detected.confidence >= 0.5,
            title: candidate.match.kind === "new" ? candidate.match.draft.title : candidate.detected.title,
            author:
              candidate.match.kind === "new"
                ? candidate.match.draft.authors.join(", ")
                : (candidate.detected.author ?? ""),
          })),
        );
      } catch {
        toast.error("Couldn't read that image. Try a JPEG or PNG.");
      }
    });
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? null);

  const selected = rows?.filter((row) => row.selected && row.match.kind !== "unmatched") ?? [];

  const runImport = () =>
    startImport(async () => {
      const items: ImportItem[] = selected.map((row) =>
        row.match.kind === "owned"
          ? { kind: "copy", bookId: row.match.bookId }
          : {
              kind: "new",
              draft: {
                ...(row.match as Extract<Row["match"], { kind: "new" }>).draft,
                title: row.title.trim() || row.detected.title,
                authors: row.author
                  .split(",")
                  .map((a) => a.trim())
                  .filter(Boolean),
              },
            },
      );
      const result = await importShelfAction(items);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDone(result.data);
      setRows(null);
      setPreview(null);
      toast.success("Import complete", {
        description: `${result.data.created} new ${result.data.created === 1 ? "book" : "books"}, ${result.data.copies} extra ${result.data.copies === 1 ? "copy" : "copies"}.`,
      });
    });

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="grid aspect-[4/3] w-full shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-input bg-background sm:w-64">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
              <img src={preview} alt="Your shelf photo" className="size-full object-cover" />
            ) : (
              <ImageUp className="size-8 text-ink-3" aria-hidden />
            )}
          </div>
          <div className="flex-1">
            <h2 className="text-[17px] font-bold">Photograph a shelf or a pile of covers</h2>
            <p className="mt-1 text-[15px] text-ink-2">
              Spines and covers both work. Good light and a straight-on angle help. Nothing is saved until you
              review and import.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => fileRef.current?.click()} disabled={scanning}>
                {scanning ? <Loader2 className="animate-spin" /> : <ImageUp />} Upload a photo
              </Button>
              <Button variant="outline" onClick={() => cameraRef.current?.click()} disabled={scanning}>
                <Camera /> Take a photo
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Upload a shelf photo"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take a shelf photo"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
        </div>
        {scanning && (
          <p role="status" className="mt-4 flex items-center gap-2 text-[15px] text-ink-2">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Reading titles and matching them with Open
            Library…
          </p>
        )}
      </section>

      {done && (
        <div role="status" className="rounded-2xl border border-accent-border bg-accent px-5 py-4 text-accent-foreground">
          Imported {done.created} new {done.created === 1 ? "book" : "books"} and {done.copies} extra{" "}
          {done.copies === 1 ? "copy" : "copies"}.{" "}
          <Link href="/?recent=1" className="font-bold underline-offset-2 hover:underline">
            See what&apos;s new
          </Link>
        </div>
      )}

      {rows && (
        <section aria-labelledby="review-heading" className="rounded-2xl border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id="review-heading" className="text-[17px] font-bold">
                Review {rows.length} detected {rows.length === 1 ? "book" : "books"}
              </h2>
              <p className="text-sm text-ink-2">Untick anything wrong, fix titles if needed, then import.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => fileRef.current?.click()}>
                <RotateCcw /> Try another photo
              </Button>
              <Button onClick={runImport} disabled={importing || selected.length === 0}>
                {importing && <Loader2 className="animate-spin" />}
                Import {selected.length}
              </Button>
            </div>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const chip = statusChip(row);
              const cover =
                row.match.kind === "owned"
                  ? row.match.coverUrl
                  : row.match.kind === "new"
                    ? row.match.draft.coverUrl
                    : null;
              const disabled = row.match.kind === "unmatched";
              return (
                <li key={row.key} className={cn("flex flex-wrap items-center gap-4 px-5 py-3", disabled && "opacity-60")}>
                  <Checkbox
                    checked={row.selected && !disabled}
                    disabled={disabled}
                    onCheckedChange={(checked) => update(row.key, { selected: checked === true })}
                    aria-label={`Import ${row.title}`}
                    className="size-5"
                  />
                  <BookCover title={row.title} coverUrl={cover} size="sm" />
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    {row.match.kind === "new" ? (
                      <>
                        <Input
                          value={row.title}
                          onChange={(e) => update(row.key, { title: e.target.value })}
                          aria-label="Title"
                        />
                        <Input
                          value={row.author}
                          onChange={(e) => update(row.key, { author: e.target.value })}
                          aria-label="Authors"
                        />
                      </>
                    ) : (
                      <div className="sm:col-span-2">
                        <p className="truncate font-semibold">
                          {row.match.kind === "owned" ? row.match.title : row.detected.title}
                        </p>
                        <p className="truncate text-sm text-ink-2">
                          {row.match.kind === "owned"
                            ? `${row.match.authors.join(", ")} · ${row.match.totalCopies} in the catalog`
                            : `Read as “${row.detected.title}”. Not found on Open Library.`}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", chip.className)}>{chip.text}</span>
                    <span className="w-10 text-right text-xs text-ink-3" title="How sure the AI is about the title">
                      {Math.round(row.detected.confidence * 100)}%
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
