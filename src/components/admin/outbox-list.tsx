"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type OutboxItem = {
  id: string;
  toEmail: string;
  subject: string;
  bodyHtml: string;
  kind: string;
  status: "sent" | "failed" | "skipped";
  error: string | null;
  createdLabel: string;
};

const KIND_LABEL: Record<string, string> = {
  hold_ready: "Hold ready",
  due_soon: "Due soon",
  overdue: "Overdue",
};

const STATUS: Record<OutboxItem["status"], { label: string; className: string }> = {
  sent: { label: "Sent", className: "bg-success-bg text-success" },
  skipped: { label: "Recorded only", className: "bg-secondary text-ink-2" },
  failed: { label: "Failed", className: "bg-destructive-bg text-destructive" },
};

export function OutboxList({ items }: { items: OutboxItem[] }) {
  const [open, setOpen] = useState<OutboxItem | null>(null);
  return (
    <>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left hover:bg-muted"
            >
              <span className="min-w-0 flex-1 basis-60">
                <span className="block truncate text-[15px] font-semibold">{item.subject}</span>
                <span className="block truncate text-[13px] text-ink-3">To {item.toEmail}</span>
              </span>
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-foreground">
                {KIND_LABEL[item.kind] ?? item.kind}
              </span>
              <span
                className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS[item.status].className)}
                title={item.error ?? undefined}
              >
                {STATUS[item.status].label}
              </span>
              <span className="w-24 text-right text-[13px] text-ink-3">{item.createdLabel}</span>
              <Eye className="size-4 text-ink-3" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(open)} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-hidden rounded-3xl p-0 sm:max-w-2xl">
          {open && (
            <>
              <DialogHeader className="border-b border-border px-6 pt-6 pb-4">
                <DialogTitle className="pr-8">{open.subject}</DialogTitle>
                <DialogDescription>
                  To {open.toEmail} · {STATUS[open.status].label}
                  {open.error ? ` · ${open.error}` : ""}
                </DialogDescription>
              </DialogHeader>
              {/* Sandboxed: no scripts, no same-origin access. */}
              <iframe
                title={`Preview of ${open.subject}`}
                srcDoc={open.bodyHtml}
                sandbox=""
                className="h-[60dvh] w-full bg-background"
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
