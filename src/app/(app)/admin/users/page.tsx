import type { Metadata } from "next";
import { RoleSelect } from "@/components/admin/role-select";
import { PageHeader } from "@/components/shell/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { isDemoScoped } from "@/server/auth/scope";
import { requirePermission } from "@/server/auth/session";
import { listUsers } from "@/server/services/users";

export const metadata: Metadata = { title: "Users" };

const joined = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export default async function UsersPage() {
  const user = await requirePermission("user:manage");
  const rows = await listUsers(user);
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-5 md:px-8 md:py-8">
      <PageHeader
        title="Users & roles"
        description={
          isDemoScoped(user)
            ? "Demo accounts only. Changes apply on their next page load and reset nightly."
            : "Members borrow and place holds. Librarians run the desk. Admins also manage roles."
        }
      />
      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">Users and their roles</caption>
          <thead className="hidden border-b border-border bg-background text-[13px] font-semibold text-ink-3 md:table-header-group">
            <tr>
              <th scope="col" className="px-5 py-3">Person</th>
              <th scope="col" className="px-5 py-3">Activity</th>
              <th scope="col" className="px-5 py-3">Joined</th>
              <th scope="col" className="px-5 py-3">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 md:table-row md:p-0">
                <td className="flex min-w-0 flex-1 items-center gap-3 md:px-5 md:py-3">
                  <UserAvatar name={row.name} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {row.name ?? "Unnamed"}
                      {row.id === user.id && <span className="ml-2 text-xs font-bold text-primary">You</span>}
                    </span>
                    <span className="block truncate text-[13px] text-ink-3">{row.email}</span>
                  </span>
                </td>
                <td className="text-[13px] text-ink-2 md:px-5 md:py-3">
                  {row.openLoans} on loan
                  {row.overdue > 0 && <span className="font-semibold text-destructive"> · {row.overdue} overdue</span>}
                  {row.activeHolds > 0 && ` · ${row.activeHolds} holds`}
                </td>
                <td className="hidden text-[13px] text-ink-3 md:table-cell md:px-5 md:py-3">{joined.format(row.createdAt)}</td>
                <td className="md:px-5 md:py-3">
                  <RoleSelect
                    userId={row.id}
                    name={row.name ?? row.email ?? "This user"}
                    role={row.role}
                    disabled={row.id === user.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
