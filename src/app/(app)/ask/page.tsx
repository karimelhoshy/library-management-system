import type { Metadata } from "next";
import { cn } from "cn";
import { ChatPanel } from "@/components/chat/chat-panel";
import { requirePermission } from "@/server/auth/session";
import { isDemoMode } from "@/server/env";

export const metadata: Metadata = { title: "Ask the Librarian" };

/** Full-page chat: the phone "Ask" tab, and the chat on screens too narrow for the column. */
export default async function AskPage() {
  const user = await requirePermission("ai:chat");
  return (
    <div
      className={cn(
        "mx-auto -mb-24 flex w-full max-w-[860px] flex-col md:mb-0 md:h-full md:py-6",
        // Phones: fill the space between the demo banner and the bottom tab bar.
        isDemoMode() ? "h-[calc(100dvh-2rem-4rem)]" : "h-[calc(100dvh-4rem)]",
      )}
    >
      <div className="min-h-0 flex-1 overflow-hidden md:rounded-3xl md:border md:border-border">
        <ChatPanel variant="page" userName={user.name} />
      </div>
    </div>
  );
}
