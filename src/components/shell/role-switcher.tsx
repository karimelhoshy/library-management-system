"use client";

import { Check, ChevronsUpDown, Loader2, LogOut } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { signInAsDemo, signOutAction } from "@/server/actions/auth";

type Role = "admin" | "librarian" | "member";

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", librarian: "Librarian", member: "Member" };

export type SwitcherUser = { id: string; name: string | null; role: Role };

/** Where to land after switching: stay put unless the new role can't see this page. */
function destinationFor(role: Role): string {
  const path = window.location.pathname + window.location.search;
  if (path.startsWith("/admin/users") && role !== "admin") return "/";
  if (path.startsWith("/admin") && role === "member") return "/";
  return path;
}

export function useDemoSwitch() {
  const [pending, startTransition] = useTransition();
  const switchTo = (userId: string) =>
    startTransition(async () => {
      const result = await signInAsDemo(userId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Full navigation so every server component re-renders with the new session.
      window.location.assign(destinationFor(result.data.role));
    });
  return { pending, switchTo };
}

export function RoleSwitcher({
  user,
  demoMode,
  demoUsers,
  variant = "sidebar",
}: {
  user: SwitcherUser;
  demoMode: boolean;
  demoUsers: SwitcherUser[];
  variant?: "sidebar" | "pill";
}) {
  const { pending, switchTo } = useDemoSwitch();
  const [signingOut, startSignOut] = useTransition();

  const trigger =
    variant === "pill" ? (
      <button
        type="button"
        className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-sm font-bold text-foreground shadow-[0_1px_2px_rgba(28,25,23,0.04)]"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Viewing as {ROLE_LABEL[user.role]}
      </button>
    ) : (
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:bg-muted aria-expanded:bg-muted"
      >
        <UserAvatar name={user.name} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-tight text-ink-3">
            {demoMode ? "Viewing as" : (user.name ?? "Signed in")}
          </span>
          <span className="block truncate text-[15px] leading-tight font-bold text-foreground">
            {ROLE_LABEL[user.role]}
          </span>
        </span>
        {pending ? (
          <Loader2 className="size-4 animate-spin text-ink-3" aria-hidden />
        ) : (
          <ChevronsUpDown className="size-4 text-ink-2" aria-hidden />
        )}
        <span className="sr-only">Open account menu</span>
      </button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={pending}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={variant === "pill" ? "bottom" : "top"}
        align={variant === "pill" ? "end" : "start"}
        className="w-[260px] rounded-2xl p-1.5"
      >
        <DropdownMenuLabel className="px-2.5 pt-2 pb-1">
          <span className="block text-sm font-bold text-foreground">{user.name ?? "Signed in"}</span>
          <span className="block text-xs font-normal text-ink-3">{ROLE_LABEL[user.role]}</span>
        </DropdownMenuLabel>
        {demoMode && demoUsers.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2.5 text-xs font-bold tracking-[0.06em] text-ink-3 uppercase">
                Switch demo account
              </DropdownMenuLabel>
              {demoUsers.map((demo) => (
                <DropdownMenuItem
                  key={demo.id}
                  onSelect={(event) => {
                    if (demo.id === user.id) return;
                    event.preventDefault();
                    switchTo(demo.id);
                  }}
                  className="min-h-11 gap-3 rounded-xl px-2.5"
                >
                  <UserAvatar name={demo.name} className="size-8 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{demo.name}</span>
                    <span className="block text-xs text-ink-3">{ROLE_LABEL[demo.role]}</span>
                  </span>
                  <Check className={cn("size-4 text-primary", demo.id !== user.id && "invisible")} aria-hidden />
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            startSignOut(() => signOutAction());
          }}
          className="min-h-11 gap-3 rounded-xl px-2.5"
        >
          {signingOut ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
