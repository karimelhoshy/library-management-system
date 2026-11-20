export default function Loading() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 md:px-8 md:py-8" aria-busy="true" aria-label="Loading">
      <div className="mb-6 hidden h-5 w-20 animate-pulse rounded bg-muted md:block" />
      <div className="grid gap-10 rounded-3xl border border-border bg-surface p-6 md:grid-cols-[240px_1fr] md:p-8">
        <div className="mx-auto aspect-[2/3] w-[150px] animate-pulse rounded-[10px] bg-muted md:w-full" />
        <div className="flex flex-col gap-3">
          <div className="h-10 w-3/4 animate-pulse rounded-lg bg-muted" />
          <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-24 w-full animate-pulse rounded-xl bg-muted" />
          <div className="mt-3 h-20 w-full max-w-lg animate-pulse rounded-2xl bg-muted" />
          <div className="mt-3 h-12 w-48 animate-pulse rounded-[14px] bg-muted" />
        </div>
      </div>
    </div>
  );
}
