"use client";

import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useChat } from "./chat-provider";
import { ChatPanel } from "./chat-panel";

/** The right-hand chat column on wide screens, plus a launcher when it's hidden. */
export function ChatColumn({ userName }: { userName: string | null }) {
  const chat = useChat();
  const pathname = usePathname();
  if (pathname === "/ask") return null;

  return (
    <>
      {chat.columnOpen && (
        <aside className="hidden h-full w-[380px] shrink-0 border-l border-border xl:block">
          <ChatPanel variant="column" userName={userName} />
        </aside>
      )}
      {/* Launcher: reopens the column on wide screens, or goes to /ask on tablets. */}
      <button
        type="button"
        onClick={chat.openColumn}
        className={`fixed right-6 bottom-6 z-30 hidden h-12 items-center gap-2 rounded-full bg-primary pr-5 pl-4 font-semibold text-white shadow-lg transition-colors hover:bg-primary-hover ${chat.columnOpen ? "" : "xl:inline-flex"}`}
      >
        <MessageSquare className="size-5" aria-hidden />
        Ask the Librarian
      </button>
      <Link
        href="/ask"
        className="fixed right-6 bottom-6 z-30 hidden h-12 items-center gap-2 rounded-full bg-primary pr-5 pl-4 font-semibold text-white shadow-lg transition-colors hover:bg-primary-hover md:inline-flex xl:hidden"
      >
        <MessageSquare className="size-5" aria-hidden />
        Ask the Librarian
      </Link>
    </>
  );
}
