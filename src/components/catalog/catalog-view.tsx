"use client";

import { Check, ChevronDown, Loader2, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { cn } from "cn";
import { openCommandPalette } from "@/components/shell/command-palette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PRIMARY_GENRES } from "@/lib/config";

export const SORT_LABELS = {
  relevance: "relevance",
  title: "title",
  newest: "newest",
  popular: "most borrowed",
} as const;

type Patch = Record<string, string | null>;

function Chip({
  active,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium whitespace-nowrap transition-colors",
        active
          ? "border-foreground bg-foreground text-white hover:bg-foreground/85"
          : "border-border bg-surface text-foreground hover:border-input hover:bg-muted",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function CatalogView({
  aiEnabled,
  languages,
  children,
}: {
  aiEnabled: boolean;
  languages: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const urlQuery = params.get("q") ?? "";
  const [text, setText] = useState(urlQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const vibe = params.get("vibe") === "1";

  // Keep the box in sync when the URL changes from elsewhere (⌘K, back button).
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(urlQuery);
  }, [urlQuery]);

  const apply = (patch: Patch) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // Debounced search-as-you-type. Vibe search waits a little longer (each query is embedded).
  useEffect(() => {
    if (text === urlQuery) return;
    const timer = setTimeout(() => apply({ q: text.trim() || null }), vibe ? 650 : 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads the latest params
  }, [text, vibe]);

  const genre = params.get("genre");
  const toggle = (key: string, value: string) => apply({ [key]: params.get(key) === value ? null : value });
  const moreCount = ["lang", "yearFrom", "yearTo", "minPages"].filter((k) => params.get(k)).length;

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
    <div>
      <section className="rounded-3xl border border-border bg-surface p-5 sm:p-8">
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] sm:text-[40px]">
          What are you reading next?
        </h1>
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

        <div
          className="-mx-5 mt-4 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="Filters"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Chip active>
                {genre ?? "Any genre"}
                <ChevronDown className="size-4 opacity-70" aria-hidden />
              </Chip>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 rounded-2xl p-1.5">
              <DropdownMenuItem onSelect={() => apply({ genre: null })} className="min-h-10 rounded-xl">
                Any genre
                {!genre && <Check className="ml-auto size-4 text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {PRIMARY_GENRES.map((g) => (
                <DropdownMenuItem key={g} onSelect={() => apply({ genre: g })} className="min-h-10 rounded-xl">
                  {g}
                  {genre === g && <Check className="ml-auto size-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Chip active={params.get("available") === "1"} onClick={() => toggle("available", "1")}>
            Available now
          </Chip>
          <Chip active={params.get("maxPages") === "300"} onClick={() => toggle("maxPages", "300")}>
            Under 300 pages
          </Chip>
          <Chip active={params.get("tag") === "Translated"} onClick={() => toggle("tag", "Translated")}>
            Translated
          </Chip>
          <Chip active={params.get("recent") === "1"} onClick={() => toggle("recent", "1")}>
            New this month
          </Chip>
          <Popover>
            <PopoverTrigger asChild>
              <Chip active={moreCount > 0}>
                <SlidersHorizontal className="size-4" aria-hidden />
                More filters{moreCount > 0 ? ` · ${moreCount}` : ""}
              </Chip>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[300px] rounded-2xl p-4">
              <MoreFilters languages={languages} params={params} apply={apply} />
            </PopoverContent>
          </Popover>
        </div>
      </section>

      <div className={cn("mt-8 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
        {children}
      </div>
    </div>
  );
}

function MoreFilters({
  languages,
  params,
  apply,
}: {
  languages: string[];
  params: URLSearchParams | ReturnType<typeof useSearchParams>;
  apply: (patch: Patch) => void;
}) {
  const [yearFrom, setYearFrom] = useState(params.get("yearFrom") ?? "");
  const [yearTo, setYearTo] = useState(params.get("yearTo") ?? "");
  const [minPages, setMinPages] = useState(params.get("minPages") ?? "");
  const lang = params.get("lang");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ yearFrom: yearFrom || null, yearTo: yearTo || null, minPages: minPages || null });
      }}
    >
      <div>
        <p className="mb-1.5 text-sm font-semibold">Language</p>
        <div className="flex flex-wrap gap-1.5">
          {["Any", ...languages].map((language) => {
            const active = language === "Any" ? !lang : lang === language;
            return (
              <button
                key={language}
                type="button"
                aria-pressed={active}
                onClick={() => apply({ lang: language === "Any" ? null : language })}
                className={cn(
                  "h-9 rounded-full border px-3 text-sm",
                  active ? "border-foreground bg-foreground text-white" : "border-border hover:bg-muted",
                )}
              >
                {language}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="year-from" className="mb-1.5 text-sm font-semibold">
            Published from
          </Label>
          <Input
            id="year-from"
            inputMode="numeric"
            placeholder="1900"
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <div>
          <Label htmlFor="year-to" className="mb-1.5 text-sm font-semibold">
            to
          </Label>
          <Input
            id="year-to"
            inputMode="numeric"
            placeholder="2025"
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="min-pages" className="mb-1.5 text-sm font-semibold">
          At least this many pages
        </Label>
        <Input
          id="min-pages"
          inputMode="numeric"
          placeholder="e.g. 400"
          value={minPages}
          onChange={(e) => setMinPages(e.target.value.replace(/\D/g, "").slice(0, 5))}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="h-10 flex-1 rounded-xl bg-primary text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            setYearFrom("");
            setYearTo("");
            setMinPages("");
            apply({ yearFrom: null, yearTo: null, minPages: null, lang: null });
          }}
          className="h-10 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-muted"
        >
          Reset
        </button>
      </div>
    </form>
  );
}

export function SortMenu({ sort, vibe }: { sort: keyof typeof SORT_LABELS; vibe: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (vibe) return <span className="text-[15px] text-ink-2">Sorted by meaning</span>;
  const set = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "relevance") next.delete("sort");
    else next.set("sort", value);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-10 items-center gap-1 rounded-xl px-2 text-[15px] text-ink-2 hover:bg-muted hover:text-foreground">
        Sorted by {SORT_LABELS[sort]}
        <ChevronDown className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5">
        <DropdownMenuLabel className="text-xs text-ink-3">Sort by</DropdownMenuLabel>
        {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((key) => (
          <DropdownMenuItem key={key} onSelect={() => set(key)} className="min-h-10 rounded-xl capitalize">
            {SORT_LABELS[key]}
            {sort === key && <Check className="ml-auto size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
