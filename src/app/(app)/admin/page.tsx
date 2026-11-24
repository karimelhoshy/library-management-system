import { AlertTriangle, BellRing, BookCopy, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { AiUsageCard } from "@/components/admin/ai-usage-card";
import { toDeskLoans } from "@/components/admin/desk-loans";
import { LoanDeskList } from "@/components/admin/loan-desk-list";
import { LoansChart } from "@/components/admin/loans-chart";
import { StatCard } from "@/components/admin/stat-card";
import { BookCover } from "@/components/books/book-cover";
import { PageHeader } from "@/components/shell/page-header";
import { getAiUsage } from "@/server/ai/rate-limit";
import { requirePermission } from "@/server/auth/session";
import { geminiModels, isAiEnabled } from "@/server/env";
import { listRecentActivity } from "@/server/services/activity";
import { getDashboardStats, getLoansPerDay, getTopBorrowed } from "@/server/services/dashboard";
import { listActiveLoans } from "@/server/services/loans";

export const metadata: Metadata = { title: "Dashboard" };

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const user = await requirePermission("desk:read");
  const [stats, perDay, top, overdue, activity, aiUsage] = await Promise.all([
    getDashboardStats(user),
    getLoansPerDay(user, 30),
    getTopBorrowed(user, 5),
    listActiveLoans(user, { overdueOnly: true }),
    listRecentActivity(user, 10),
    isAiEnabled() ? getAiUsage(user) : null,
  ]);
  const loans30 = perDay.reduce((sum, d) => sum + d.loans, 0);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader title="Dashboard" description="How the library is doing today." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Books" value={stats.titles} detail={`${stats.copies} copies`} icon={BookCopy} />
        <StatCard
          label="On loan now"
          value={stats.onLoan}
          detail={`${Math.round((stats.onLoan / Math.max(1, stats.copies)) * 100)}% of copies`}
          icon={Clock}
          href="/admin/loans"
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          detail={stats.overdue ? "Reminders go out daily" : "All on time"}
          icon={AlertTriangle}
          tone={stats.overdue ? "danger" : "neutral"}
          href="/admin/loans?overdue=1"
        />
        <StatCard
          label="Holds ready"
          value={stats.holdsReady}
          detail={`${stats.holdsWaiting} waiting in queues`}
          icon={BellRing}
          tone="accent"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Loans per day" action={<span className="text-[13px] text-ink-3">{loans30} in the last 30 days</span>}>
          <LoansChart data={perDay} />
        </Card>
        <Card title="Most borrowed" action={<span className="text-[13px] text-ink-3">last 60 days</span>}>
          <ol className="flex flex-col gap-3">
            {top.map((book, index) => (
              <li key={book.id}>
                <Link href={`/books/${book.id}`} className="flex items-center gap-3 rounded-xl hover:text-accent-foreground">
                  <span className="w-4 text-right text-sm font-bold text-ink-3">{index + 1}</span>
                  <BookCover title={book.title} coverUrl={book.coverUrl} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{book.title}</span>
                    <span className="block truncate text-[13px] text-ink-3">{book.authors.join(", ")}</span>
                  </span>
                  <span className="text-sm font-bold text-ink-2">{book.count}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card
          title={`Overdue (${overdue.length})`}
          action={
            <Link href="/admin/loans?overdue=1" className="text-sm font-semibold text-primary hover:underline">
              Loans desk
            </Link>
          }
        >
          {overdue.length ? (
            <LoanDeskList loans={toDeskLoans(overdue)} compact />
          ) : (
            <p className="text-[15px] text-ink-2">Nothing overdue. Lovely.</p>
          )}
        </Card>
        <Card
          title="Recent activity"
          action={
            <Link href="/admin/activity" className="text-sm font-semibold text-primary hover:underline">
              View all
            </Link>
          }
        >
          <ActivityFeed items={activity} />
        </Card>
      </div>

      {aiUsage && (
        <div className="mt-6">
          <AiUsageCard usage={aiUsage} models={geminiModels()} />
        </div>
      )}
    </div>
  );
}
