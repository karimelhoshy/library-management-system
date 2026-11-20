"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning-bg text-warning">
          <TriangleAlert className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-[26px] font-extrabold tracking-[-0.03em]">Something went wrong</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          The page hit an unexpected error. It&apos;s been logged; trying again usually helps.
        </p>
        <Button onClick={reset} className="mt-6">
          <RotateCcw aria-hidden /> Try again
        </Button>
      </div>
    </div>
  );
}
