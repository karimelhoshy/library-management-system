export default function Loading() {
  return (
    <div className="mx-auto max-w-[900px] px-4 py-5 md:px-8 md:py-8" aria-busy="true" aria-label="Loading">
      <div className="mb-6 h-9 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-[100px] animate-pulse rounded-2xl border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
