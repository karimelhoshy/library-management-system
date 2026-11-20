"use client";

import { cn } from "cn";
import { FilterBar } from "./filter-bar";
import { SearchBox } from "./search-box";
import { useUrlFilters } from "./use-url-filters";

/** Catalog hero (search + filters) around the server-rendered results. */
export function CatalogView({
  aiEnabled,
  languages,
  children,
}: {
  aiEnabled: boolean;
  languages: string[];
  children: React.ReactNode;
}) {
  const filters = useUrlFilters();
  return (
    <div>
      <section className="rounded-3xl border border-border bg-surface p-5 sm:p-8">
        <h1 className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.03em] sm:text-[40px]">
          What are you reading next?
        </h1>
        <SearchBox aiEnabled={aiEnabled} filters={filters} />
        <FilterBar languages={languages} filters={filters} />
      </section>

      <div className={cn("mt-8 transition-opacity", filters.pending && "opacity-60")} aria-busy={filters.pending}>
        {children}
      </div>
    </div>
  );
}
