import type { Metadata } from "next";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/server/auth/session";
import { listRecentActivity } from "@/server/services/activity";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await requirePermission("desk:read");
  const items = await listRecentActivity(user, 100);
  return (
    <div className="mx-auto max-w-[800px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader title="Activity log" description="Every change, who made it and when. Newest first." />
      <section className="rounded-2xl border border-border bg-surface px-5 py-2">
        <ActivityFeed items={items} />
      </section>
    </div>
  );
}
