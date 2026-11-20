import { cn } from "cn";

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

/** Amber initial circle. Amber is reserved for avatars in the design system. */
export function UserAvatar({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-amber text-[15px] font-bold text-amber-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
