import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { toDeskLoans } from "@/components/admin/desk-loans";
import { LoanDeskList } from "@/components/admin/loan-desk-list";
import { PageHeader } from "@/components/shell/page-header";
import { Input } from "@/components/ui/input";
import { requirePermission } from "@/server/auth/session";
import { listActiveLoans } from "@/server/services/loans";

export const metadata: Metadata = { title: "Loans desk" };

export default async function LoansDeskPage({ searchParams }: PageProps<"/admin/loans">) {
  const user = await requirePermission("loan:any");
  const params = await searchParams;
  const overdueOnly = params.overdue === "1";
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const loans = await listActiveLoans(user, { overdueOnly, q });

  const tabs = [
    { label: "All open loans", href: q ? `/admin/loans?q=${encodeURIComponent(q)}` : "/admin/loans", active: !overdueOnly },
    {
      label: "Overdue",
      href: `/admin/loans?overdue=1${q ? `&q=${encodeURIComponent(q)}` : ""}`,
      active: overdueOnly,
    },
  ];

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader
        title="Loans desk"
        description="Every book that's out right now. Return on behalf of a member, or lend from any book page."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-full border px-4 text-[15px] font-semibold",
              tab.active ? "border-foreground bg-foreground text-white" : "border-border bg-surface hover:bg-muted",
            )}
          >
            {tab.label}
          </Link>
        ))}
        <form className="ml-auto w-full sm:w-72" action="/admin/loans">
          {overdueOnly && <input type="hidden" name="overdue" value="1" />}
          <label htmlFor="desk-search" className="sr-only">
            Filter by member or title
          </label>
          <Input id="desk-search" name="q" defaultValue={q} placeholder="Filter by member or title" type="search" />
        </form>
      </div>
      <section className="rounded-2xl border border-border bg-surface px-5 py-2">
        {loans.length ? (
          <LoanDeskList loans={toDeskLoans(loans)} />
        ) : (
          <p className="py-8 text-center text-[15px] text-ink-2">
            {overdueOnly ? "Nothing overdue." : "No open loans match."}
          </p>
        )}
      </section>
      <p className="mt-3 text-[13px] text-ink-3">{loans.length} shown</p>
    </div>
  );
}
