"use client";

import { Loader2 } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeRoleAction } from "@/server/actions/users";

type Role = "admin" | "librarian" | "member";
const LABEL: Record<Role, string> = { admin: "Admin", librarian: "Librarian", member: "Member" };

export function RoleSelect({
  userId,
  name,
  role,
  disabled,
}: {
  userId: string;
  name: string;
  role: Role;
  disabled?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useOptimistic(role);
  return (
    <div className="flex items-center gap-2">
      <Select
        value={current}
        disabled={disabled || pending}
        onValueChange={(value) =>
          startTransition(async () => {
            setCurrent(value as Role);
            const result = await changeRoleAction(userId, value);
            if (result.ok) toast.success(`${name} is now ${value === "admin" ? "an" : "a"} ${LABEL[value as Role]}`);
            else toast.error(result.error);
          })
        }
      >
        <SelectTrigger className="h-10 w-36 rounded-xl" aria-label={`Role for ${name}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-xl">
          {(Object.keys(LABEL) as Role[]).map((r) => (
            <SelectItem key={r} value={r}>
              {LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && <Loader2 className="size-4 animate-spin text-ink-3" aria-label="Saving" />}
    </div>
  );
}
