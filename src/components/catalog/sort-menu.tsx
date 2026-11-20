"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUrlFilters } from "./use-url-filters";

export const SORT_LABELS = {
  relevance: "relevance",
  title: "title",
  newest: "newest",
  popular: "most borrowed",
} as const;

export function SortMenu({ sort, vibe }: { sort: keyof typeof SORT_LABELS; vibe: boolean }) {
  const { apply } = useUrlFilters();
  if (vibe) return <span className="text-[15px] text-ink-2">Sorted by meaning</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-10 items-center gap-1 rounded-xl px-2 text-[15px] text-ink-2 hover:bg-muted hover:text-foreground">
        Sorted by {SORT_LABELS[sort]}
        <ChevronDown className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5">
        <DropdownMenuLabel className="text-xs text-ink-3">Sort by</DropdownMenuLabel>
        {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((key) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => apply({ sort: key === "relevance" ? null : key })}
            className="min-h-10 rounded-xl capitalize"
          >
            {SORT_LABELS[key]}
            {sort === key && <Check className="ml-auto size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
