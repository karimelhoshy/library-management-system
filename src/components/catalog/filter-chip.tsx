import { cn } from "cn";

export function FilterChip({
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
