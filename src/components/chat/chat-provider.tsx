"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ChatMessage, ChatProposal, ChatThreadResponse } from "@/lib/chat-types";
import { resolveProposalAction } from "@/server/actions/ai";
import { applyStreamEvent, streamChat } from "./stream";

const COLUMN_KEY = "shelfwise:chat-column";
const WIDE_QUERY = "(min-width: 1280px)";

type ChatContextValue = {
  aiEnabled: boolean;
  messages: ChatMessage[];
  threadId: string | null;
  sending: boolean;
  loaded: boolean;
  columnOpen: boolean;
  /** True when the right-hand chat column can be shown (wide screen, not on /ask). */
  columnAvailable: () => boolean;
  openColumn: () => void;
  closeColumn: () => void;
  ensureLoaded: () => void;
  send: (text: string) => Promise<void>;
  /** Ask a question from elsewhere in the app (e.g. "Ask about this book"). */
  ask: (text: string) => void;
  newChat: () => void;
  resolveProposal: (messageId: string, proposalId: string, decision: "confirm" | "dismiss") => Promise<void>;
  registerComposer: (el: HTMLTextAreaElement | null) => void;
  focusComposer: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used inside <ChatProvider>");
  return context;
}

function readColumnPreference(): boolean {
  try {
    return window.localStorage.getItem(COLUMN_KEY) !== "closed";
  } catch {
    return true;
  }
}

function writeColumnPreference(open: boolean) {
  try {
    window.localStorage.setItem(COLUMN_KEY, open ? "open" : "closed");
  } catch {
    // Storage can be unavailable (private mode); the preference just won't persist.
  }
}

let localId = 0;
const tempId = (prefix: string) => `${prefix}-${Date.now()}-${++localId}`;

export function ChatProvider({ aiEnabled, children }: { aiEnabled: boolean; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [columnOpen, setColumnOpen] = useState(true);
  const loadingRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingAsk = useRef<string | null>(null);

  useEffect(() => {
    setColumnOpen(readColumnPreference());
  }, []);

  const ensureLoaded = useCallback(() => {
    if (loadingRef.current || !aiEnabled) {
      if (!aiEnabled) setLoaded(true);
      return;
    }
    loadingRef.current = true;
    fetch("/api/ai/chat", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<ChatThreadResponse>) : null))
      .then((data) => {
        if (data) {
          setThreadId(data.threadId);
          setMessages((current) => (current.length ? current : data.messages));
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [aiEnabled]);

  const columnAvailable = useCallback(
    () => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches && pathname !== "/ask",
    [pathname],
  );

  const focusComposer = useCallback(() => {
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const openColumn = useCallback(() => {
    setColumnOpen(true);
    writeColumnPreference(true);
    focusComposer();
  }, [focusComposer]);

  const closeColumn = useCallback(() => {
    setColumnOpen(false);
    writeColumnPreference(false);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending || !aiEnabled) return;
      setSending(true);
      const userMessage: ChatMessage = {
        id: tempId("user"),
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      };
      let assistantId = tempId("assistant");
      const assistant: ChatMessage = {
        id: assistantId,
        role: "assistant",
        text: "",
        createdAt: new Date().toISOString(),
        pending: true,
        status: "Thinking…",
      };
      setMessages((current) => [...current, userMessage, assistant]);

      const update = (fn: (message: ChatMessage) => ChatMessage) => {
        const id = assistantId;
        setMessages((current) => current.map((m) => (m.id === id ? fn(m) : m)));
      };

      try {
        for await (const event of streamChat(threadId, text)) {
          if (event.type === "thread") {
            setThreadId(event.threadId);
            // Take the saved reply's id now, so its confirm cards work before the reply ends.
            update((m) => ({ ...m, id: event.messageId }));
            assistantId = event.messageId;
          } else update((m) => applyStreamEvent(m, event));
        }
        update((m) => ({ ...m, pending: false, status: undefined }));
      } catch (error) {
        update((m) => ({
          ...m,
          pending: false,
          status: undefined,
          error: true,
          text: error instanceof Error ? error.message : "Something went wrong.",
        }));
      } finally {
        setSending(false);
      }
    },
    [aiEnabled, sending, threadId],
  );

  const ask = useCallback(
    (text: string) => {
      if (columnAvailable()) {
        openColumn();
        void send(text);
      } else {
        pendingAsk.current = text;
        router.push("/ask");
      }
    },
    [columnAvailable, openColumn, router, send],
  );

  // A question asked from another page while the column wasn't available: send it on /ask.
  useEffect(() => {
    if (pathname === "/ask" && pendingAsk.current) {
      const text = pendingAsk.current;
      pendingAsk.current = null;
      void send(text);
    }
  }, [pathname, send]);

  const newChat = useCallback(() => {
    setMessages([]);
    setThreadId(null);
    focusComposer();
  }, [focusComposer]);

  const resolveProposal = useCallback(
    async (messageId: string, proposalId: string, decision: "confirm" | "dismiss") => {
      const setProposal = (fn: (p: ChatProposal) => ChatProposal) =>
        setMessages((current) =>
          current.map((m) =>
            m.id === messageId
              ? { ...m, proposals: m.proposals?.map((p) => (p.id === proposalId ? fn(p) : p)) }
              : m,
          ),
        );
      const result = await resolveProposalAction(messageId, proposalId, decision);
      if (result.ok) {
        setProposal(() => result.data.proposal);
        if (result.data.proposal.status === "confirmed") router.refresh();
      } else {
        setProposal((p) => ({ ...p, status: "failed", resultMessage: result.error }));
      }
    },
    [router],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      aiEnabled,
      messages,
      threadId,
      sending,
      loaded,
      columnOpen,
      columnAvailable,
      openColumn,
      closeColumn,
      ensureLoaded,
      send,
      ask,
      newChat,
      resolveProposal,
      registerComposer: (el) => {
        composerRef.current = el;
      },
      focusComposer,
    }),
    [
      aiEnabled,
      messages,
      threadId,
      sending,
      loaded,
      columnOpen,
      columnAvailable,
      openColumn,
      closeColumn,
      ensureLoaded,
      send,
      ask,
      newChat,
      resolveProposal,
      focusComposer,
    ],
  );

  return <ChatContext value={value}>{children}</ChatContext>;
}
