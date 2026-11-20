import { ShieldOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="flex min-h-[70dvh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-destructive-bg text-destructive">
          <ShieldOff className="size-7" aria-hidden />
        </span>
        <p className="mt-5 text-sm font-bold tracking-[0.08em] text-ink-3 uppercase">403 · Not allowed</p>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.03em]">This page is for library staff</h1>
        <p className="mt-2 text-[15px] text-ink-2">
          Your account doesn&apos;t have access here. If you&apos;re trying the demo, switch roles from the account
          menu.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Back to the catalog</Link>
        </Button>
      </div>
    </main>
  );
}
