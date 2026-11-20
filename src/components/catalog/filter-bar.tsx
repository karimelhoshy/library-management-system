"use client";

import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PRIMARY_GENRES } from "@/lib/config";
import { FilterChip } from "./filter-chip";
import { MoreFilters } from "./more-filters";
import type { UrlFilters } from "./use-url-filters";

/** One-tap filters. On phones the row scrolls sideways instead of wrapping. */
export function FilterBar({ languages, filters }: { languages: string[]; filters: UrlFilters }) {
  const { params, apply, toggle } = filters;
  const genre = params.get("genre");
  const moreCount = ["lang", "yearFrom", "yearTo", "minPages"].filter((k) => params.get(k)).length;

  return (
    <div
      className="-mx-5 mt-4 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
      role="group"
      aria-label="Filters"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <FilterChip active>
            {genre ?? "Any genre"}
            <ChevronDown className="size-4 opacity-70" aria-hidden />
          </FilterChip>
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
      <FilterChip active={params.get("available") === "1"} onClick={() => toggle("available", "1")}>
        Available now
      </FilterChip>
      <FilterChip active={params.get("maxPages") === "300"} onClick={() => toggle("maxPages", "300")}>
        Under 300 pages
      </FilterChip>
      <FilterChip active={params.get("tag") === "Translated"} onClick={() => toggle("tag", "Translated")}>
        Translated
      </FilterChip>
      <FilterChip active={params.get("recent") === "1"} onClick={() => toggle("recent", "1")}>
        New this month
      </FilterChip>
      <Popover>
        <PopoverTrigger asChild>
          <FilterChip active={moreCount > 0}>
            <SlidersHorizontal className="size-4" aria-hidden />
            More filters{moreCount > 0 ? ` · ${moreCount}` : ""}
          </FilterChip>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[300px] rounded-2xl p-4">
          <MoreFilters languages={languages} filters={filters} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
