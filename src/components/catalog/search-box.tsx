"use client";

import { Loader2, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { openCommandPalette } from "@/components/shell/command-palette";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UrlFilters } from "./use-url-filters";

/** The search box plus the "Search by vibe" toggle. Results update as you type. */
export function SearchBox({ aiEnabled, filters }: { aiEnabled: boolean; filters: UrlFilters }) {
  const { params, apply, pending } = filters;
  const urlQuery = params.get("q") ?? "";
  const vibe = params.get("vibe") === "1";
  const [text, setText] = useState(urlQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the box in sync when the URL changes from elsewhere (⌘K, back button).
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(urlQuery);
  }, [urlQuery]);

  // Debounced search-as-you-type. Vibe search waits a little longer (each query is embedded).
  useEffect(() => {
    if (text === urlQuery) return;
    const timer = setTimeout(() => apply({ q: text.trim() || null }), vibe ? 650 : 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads the latest params
  }, [text, vibe]);

  const vibeButton = (
    <button
      type="button"
      aria-pressed={vibe}
      disabled={!aiEnabled}
      onClick={() => apply({ vibe: vibe ? null : "1", sort: null })}
      className={cn(
        "inline-flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-[14px] px-5 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-6",
        vibe
          ? "bg-primary text-white hover:bg-primary-hover"
          : "border border-accent-border bg-accent text-accent-foreground hover:bg-accent-border/60",
      )}
    >
      <Sparkles className="size-[18px]" aria-hidden />
      Search by vibe
    </button>
  );

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ q: text.trim() || null });
      }}
      className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row"
    >
      <div className="relative flex-1">
        <label htmlFor="catalog-search" className="sr-only">
          Search the catalog
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-2"
          aria-hidden
        />
        <Input
          ref={inputRef}
          id="catalog-search"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={vibe ? "Describe a mood, e.g. cozy mystery set in Japan" : "Title, author, ISBN or tag"}
          autoComplete="off"
          className="h-14 rounded-[14px] pr-24 pl-12 text-base md:text-[17px] [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-1.5">
          {pending && <Loader2 className="size-4 animate-spin text-ink-3" aria-label="Searching" />}
          {text && (
            <button
              type="button"
              onClick={() => {
                setText("");
                apply({ q: null });
                inputRef.current?.focus();
              }}
              className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={openCommandPalette}
            className="hidden h-7 items-center rounded-md border border-border bg-surface-sunken px-1.5 text-xs font-semibold text-ink-3 hover:text-foreground sm:inline-flex"
            aria-label="Open command palette"
          >
            ⌘K
          </button>
        </div>
      </div>
      {aiEnabled ? (
        vibeButton
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex w-full rounded-[14px] sm:w-auto">
              {vibeButton}
            </span>
          </TooltipTrigger>
          <TooltipContent>Vibe search needs an AI key on this library.</TooltipContent>
        </Tooltip>
      )}
    </form>
  );
}
