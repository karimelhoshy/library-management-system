"use client";

import {
  ArrowLeftRight,
  BookOpen,
  Camera,
  ChartLine,
  Clock,
  History,
  LayoutGrid,
  Mail,
  MessageSquare,
  Plus,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useChat } from "@/components/chat/chat-provider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { paletteSearchAction, type PaletteBook } from "@/server/actions/search";

export const OPEN_PALETTE_EVENT = "shelfwise:open-palette";

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

type Entry = { label: string; href: string; icon: LucideIcon; keywords?: string[] };

export function CommandPalette({ role }: { role: "admin" | "librarian" | "member" }) {
  const router = useRouter();
  const chat = useChat();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [books, setBooks] = useState<PaletteBook[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await paletteSearchAction(term);
      if (!cancelled && result.ok) setBooks(result.data);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const visibleBooks = query.trim().length >= 2 ? books : [];
  const desk = role !== "member";
  const pages: Entry[] = [
    { label: "Catalog", href: "/", icon: LayoutGrid, keywords: ["browse", "search", "home"] },
    { label: "My loans & holds", href: "/loans", icon: Clock, keywords: ["due", "renew", "return"] },
    ...(desk
      ? [
          { label: "Dashboard", href: "/admin", icon: ChartLine, keywords: ["stats", "chart"] },
          { label: "Loans desk", href: "/admin/loans", icon: ArrowLeftRight, keywords: ["overdue", "return"] },
          { label: "Email outbox", href: "/admin/outbox", icon: Mail, keywords: ["reminders"] },
          { label: "Activity log", href: "/admin/activity", icon: History },
        ]
      : []),
    ...(role === "admin" ? [{ label: "Users & roles", href: "/admin/users", icon: Users }] : []),
  ];
  const actions: Entry[] = [
    { label: "Search by vibe", href: "/?vibe=1", icon: Sparkles, keywords: ["semantic", "meaning"] },
    ...(desk
      ? [
          { label: "Add a book by ISBN", href: "/admin/books/new", icon: Plus, keywords: ["scan", "barcode"] },
          { label: "Import from a shelf photo", href: "/admin/books/new?tab=photo", icon: Camera },
        ]
      : []),
  ];

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Jump to"
      description="Search books, pages and actions"
      className="rounded-2xl sm:max-w-xl"
    >
      <CommandInput placeholder="Search books, pages and actions…" value={query} onValueChange={setQuery} />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No matches. Try a title or author.</CommandEmpty>
        {visibleBooks.length > 0 && (
          <CommandGroup heading="Books">
            {visibleBooks.map((book) => (
              <CommandItem
                key={book.id}
                value={`book-${book.id} ${book.title} ${book.authors.join(" ")}`}
                onSelect={() => go(`/books/${book.id}`)}
                className="min-h-11 rounded-xl"
              >
                <BookOpen aria-hidden />
                <span className="truncate font-semibold">{book.title}</span>
                <span className="ml-auto truncate text-xs text-ink-3">{book.authors[0]}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {query.trim().length >= 2 && (
          <CommandGroup heading="Search">
            <CommandItem
              value={`search-catalog ${query}`}
              onSelect={() => go(`/?q=${encodeURIComponent(query.trim())}`)}
              className="min-h-11 rounded-xl"
            >
              <LayoutGrid aria-hidden />
              Search the catalog for “{query.trim()}”
            </CommandItem>
            {chat.aiEnabled && (
              <CommandItem
                value={`ask-librarian ${query}`}
                onSelect={() => {
                  setOpen(false);
                  chat.ask(query.trim());
                  setQuery("");
                }}
                className="min-h-11 rounded-xl"
              >
                <MessageSquare aria-hidden />
                Ask the Librarian “{query.trim()}”
              </CommandItem>
            )}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Pages">
          {pages.map((entry) => (
            <CommandItem
              key={entry.href}
              value={`${entry.label} ${entry.keywords?.join(" ") ?? ""}`}
              onSelect={() => go(entry.href)}
              className="min-h-11 rounded-xl"
            >
              <entry.icon aria-hidden />
              {entry.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          {actions.map((entry) => (
            <CommandItem
              key={entry.href}
              value={`${entry.label} ${entry.keywords?.join(" ") ?? ""}`}
              onSelect={() => go(entry.href)}
              className="min-h-11 rounded-xl"
            >
              <entry.icon aria-hidden />
              {entry.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
