"use client";

import { ArrowRight, Loader2, ShieldCheck, Library, BookOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDemoSwitch } from "@/components/shell/role-switcher";
import { UserAvatar } from "@/components/user-avatar";

type DemoCard = { id: string; name: string; role: "admin" | "librarian" | "member"; pitch: string };

const ROLE_ICON = { admin: ShieldCheck, librarian: Library, member: BookOpen };
const ROLE_LABEL = { admin: "Admin", librarian: "Librarian", member: "Member" };

export function DemoAccountCards({ accounts }: { accounts: DemoCard[] }) {
  const { pending, switchTo } = useDemoSwitch();
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <ul className="grid gap-3">
      {accounts.map((account) => {
        const Icon = ROLE_ICON[account.role];
        const busy = pending && chosen === account.id;
        return (
          <li key={account.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setChosen(account.id);
                try {
                  switchTo(account.id);
                } catch {
                  toast.error("Couldn't sign in. Please try again.");
                }
              }}
              className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left transition-[border-color,box-shadow] hover:border-accent-border hover:shadow-[0_2px_12px_rgba(28,25,23,0.06)] disabled:opacity-60"
            >
              <UserAvatar name={account.name} className="size-11 text-base" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-bold text-foreground">
                  Continue as {ROLE_LABEL[account.role]} ({account.name.split(" ")[0]})
                  <Icon className="size-4 text-primary" aria-hidden />
                </span>
                <span className="mt-0.5 block text-sm text-ink-2">{account.pitch}</span>
              </span>
              {busy ? (
                <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
              ) : (
                <ArrowRight
                  className="size-5 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                  aria-hidden
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
