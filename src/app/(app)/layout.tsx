import Link from "next/link";
import { Logo } from "@/components/brand";
import { ChatColumn } from "@/components/chat/chat-column";
import { ChatProvider } from "@/components/chat/chat-provider";
import { CommandPalette } from "@/components/shell/command-palette";
import { DemoBanner } from "@/components/shell/demo-banner";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { RoleSwitcher } from "@/components/shell/role-switcher";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { DEMO_USERS } from "@/server/auth/demo-users";
import { can } from "@/server/auth/permissions";
import { requireUser } from "@/server/auth/session";
import { isAiEnabled, isDemoMode } from "@/server/env";
import { countReadyHolds } from "@/server/services/holds";
import { countOverdue } from "@/server/services/loans";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [overdue, holdsReady] = await Promise.all([countOverdue(user.id), countReadyHolds(user.id)]);
  const demoMode = isDemoMode();
  const demoUsers = demoMode ? DEMO_USERS.map(({ id, name, role }) => ({ id, name, role })) : [];
  const switcherUser = { id: user.id, name: user.name, role: user.role };

  return (
    <ChatProvider aiEnabled={isAiEnabled()}>
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-primary px-4 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh flex-col md:h-dvh md:overflow-hidden">
        {demoMode && <DemoBanner />}
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[232px] shrink-0 flex-col border-r border-border bg-surface px-3 pt-6 pb-4 md:flex">
            <Link href="/" className="mb-8 rounded-xl px-2" aria-label="Catalog home">
              <Logo />
            </Link>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidebarNav
                counts={{ overdue, holdsReady }}
                showDesk={can(user, "desk:read")}
                showUsers={can(user, "user:manage")}
              />
            </div>
            <div className="pt-4">
              <RoleSwitcher user={switcherUser} demoMode={demoMode} demoUsers={demoUsers} />
            </div>
          </aside>
          <main id="main" className="min-w-0 flex-1 pb-24 md:overflow-y-auto md:pb-0">
            <MobileTopBar>
              <RoleSwitcher user={switcherUser} demoMode={demoMode} demoUsers={demoUsers} variant="pill" />
            </MobileTopBar>
            {children}
          </main>
          <ChatColumn userName={user.name} />
        </div>
      </div>
      <MobileTabBar overdue={overdue} />
      <CommandPalette role={user.role} />
    </ChatProvider>
  );
}
