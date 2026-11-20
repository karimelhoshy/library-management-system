"use client";

import { useState } from "react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UrlFilters } from "./use-url-filters";

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/** Language, year range and minimum length, behind the "More filters" chip. */
export function MoreFilters({ languages, filters }: { languages: string[]; filters: UrlFilters }) {
  const { params, apply } = filters;
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
            onChange={(e) => setYearFrom(digits(e.target.value, 4))}
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
            onChange={(e) => setYearTo(digits(e.target.value, 4))}
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
          onChange={(e) => setMinPages(digits(e.target.value, 5))}
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
