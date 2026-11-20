import { ArrowLeftRight, ChartLine, ChevronRight, History, Mail, Plus, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RoleSwitcher } from "@/components/shell/role-switcher";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { signOutAction } from "@/server/actions/auth";
import { DEMO_USERS } from "@/server/auth/demo-users";
import { can, ROLE_LABELS } from "@/server/auth/permissions";
import { requireUser } from "@/server/auth/session";
import { isDemoMode } from "@/server/env";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const demoMode = isDemoMode();
  const desk: { href: string; label: string; icon: LucideIcon }[] = can(user, "desk:read")
    ? [
        { href: "/admin", label: "Dashboard", icon: ChartLine },
        { href: "/admin/books/new", label: "Add books", icon: Plus },
        { href: "/admin/loans", label: "Loans desk", icon: ArrowLeftRight },
        { href: "/admin/outbox", label: "Outbox", icon: Mail },
        { href: "/admin/activity", label: "Activity", icon: History },
        ...(can(user, "user:manage") ? [{ href: "/admin/users", label: "Users & roles", icon: Users }] : []),
      ]
    : [];

  return (
    <div className="mx-auto max-w-[640px] px-4 py-5 md:px-8 md:py-8">
      <section className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5">
        <UserAvatar name={user.name} className="size-14 text-xl" />
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-extrabold tracking-[-0.02em]">{user.name ?? "Reader"}</h1>
          <p className="truncate text-[15px] text-ink-2">
            {ROLE_LABELS[user.role]}
            {user.email ? ` · ${user.email}` : ""}
          </p>
        </div>
      </section>

      {demoMode && (
        <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-bold">Demo account</h2>
          <p className="mt-1 text-sm text-ink-2">Switch roles to see the app as a member, librarian or admin.</p>
          <div className="mt-3">
            <RoleSwitcher
              user={{ id: user.id, name: user.name, role: user.role }}
              demoMode
              demoUsers={DEMO_USERS.map(({ id, name, role }) => ({ id, name, role }))}
            />
          </div>
        </section>
      )}

      {desk.length > 0 && (
        <section className="mt-4 rounded-2xl border border-border bg-surface p-2">
          <h2 className="px-3 pt-3 pb-1 text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">Library desk</h2>
          <ul>
            {desk.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="flex h-12 items-center gap-3 rounded-xl px-3 font-medium hover:bg-muted">
                  <item.icon className="size-5 text-ink-2" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="size-4 text-ink-3" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form action={signOutAction} className="mt-6">
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
