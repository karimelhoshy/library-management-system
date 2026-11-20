"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelHoldAction, placeHoldAction } from "@/server/actions/holds";
import {
  borrowAction,
  renewAction,
  returnAction,
  undoBorrowAction,
  undoReturnAction,
} from "@/server/actions/loans";
import { formatShortDate } from "@/server/services/rules";

const UNDO_TOAST_MS = 8000;

/**
 * Borrow / return / renew / hold with consistent toasts and Undo.
 * Each call resolves to true on success so callers can roll back optimistic UI.
 */
export function useLoanActions() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = <T,>(fn: () => Promise<T>) =>
    new Promise<T>((resolve) => startTransition(async () => resolve(await fn())));

  const borrow = (bookId: string, opts: { memberId?: string; memberName?: string } = {}) =>
    run(async () => {
      const result = await borrowAction(bookId, opts.memberId);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      const due = formatShortDate(new Date(result.data.dueAt));
      toast.success(
        opts.memberName ? `Lent “${result.data.title}” to ${opts.memberName}` : `Borrowed “${result.data.title}”`,
        {
          description: `Due back ${due}`,
          duration: UNDO_TOAST_MS,
          action: {
            label: "Undo",
            onClick: async () => {
              const undo = await undoBorrowAction(result.data.loanId);
              if (undo.ok) toast("Loan undone");
              else toast.error(undo.error);
              router.refresh();
            },
          },
        },
      );
      return true;
    });

  const returnLoan = (loanId: string) =>
    run(async () => {
      const result = await returnAction(loanId);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success(`Returned “${result.data.title}”`, {
        description: result.data.holdReady ? "The next person in line has been told it's ready." : undefined,
        duration: UNDO_TOAST_MS,
        action: result.data.holdReady
          ? undefined
          : {
              label: "Undo",
              onClick: async () => {
                const undo = await undoReturnAction(loanId);
                if (undo.ok) toast("Return undone");
                else toast.error(undo.error);
                router.refresh();
              },
            },
      });
      return true;
    });

  const renew = (loanId: string) =>
    run(async () => {
      const result = await renewAction(loanId);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success(`Renewed “${result.data.title}”`, {
        description: `Now due ${formatShortDate(new Date(result.data.dueAt))}`,
      });
      return true;
    });

  const placeHold = (bookId: string) =>
    run(async () => {
      const result = await placeHoldAction(bookId);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success(`Hold placed on “${result.data.title}”`, {
        description:
          result.data.position === 1
            ? "You're first in line. We'll email you when it's ready."
            : `You're #${result.data.position} in line. We'll email you when it's ready.`,
      });
      return true;
    });

  const cancelHold = (holdId: string) =>
    run(async () => {
      const result = await cancelHoldAction(holdId);
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast(`Hold on “${result.data.title}” cancelled`);
      return true;
    });

  return { pending, borrow, returnLoan, renew, placeHold, cancelHold };
}
