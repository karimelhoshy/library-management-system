import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { OutboxList } from "@/components/admin/outbox-list";
import { timeAgo } from "@/components/admin/activity-feed";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/server/auth/session";
import { listOutbox } from "@/server/email/outbox";
import { isEmailEnabled } from "@/server/env";

export const metadata: Metadata = { title: "Outbox" };

export default async function OutboxPage() {
  const user = await requirePermission("desk:read");
  const rows = await listOutbox(user, 100);
  const now = new Date();
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader
        title="Email outbox"
        description={
          isEmailEnabled()
            ? "Every reminder and notice we've sent. Demo addresses are recorded here but never delivered."
            : "Email delivery isn't configured, so messages are recorded here instead of being sent."
        }
      />
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        {rows.length ? (
          <OutboxList
            items={rows.map((row) => ({
              id: row.id,
              toEmail: row.toEmail,
              subject: row.subject,
              bodyHtml: row.bodyHtml,
              kind: row.kind,
              status: row.status,
              error: row.error,
              createdLabel: timeAgo(row.createdAt, now),
            }))}
          />
        ) : (
          <div className="px-6 py-12 text-center">
            <Inbox className="mx-auto size-7 text-ink-3" aria-hidden />
            <p className="mt-3 font-bold">No emails yet</p>
            <p className="mt-1 text-[15px] text-ink-2">
              Reminders go out once a day, and hold notices as soon as a copy is set aside.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
