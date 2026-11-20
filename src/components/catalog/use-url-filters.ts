"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** Keys to set (string) or remove (null or ""). */
export type FilterPatch = Record<string, string | null>;

/** The catalog query lives in the URL, so searches can be shared and the back button works. */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = (patch: FilterPatch) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  /** Turns a filter on, or off if it already has this value. */
  const toggle = (key: string, value: string) => apply({ [key]: params.get(key) === value ? null : value });

  return { params, apply, toggle, pending };
}

export type UrlFilters = ReturnType<typeof useUrlFilters>;
