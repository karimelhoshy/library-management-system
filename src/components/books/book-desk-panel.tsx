"use client";

import { Loader2, Pencil, Plus, Trash2, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useLoanActions } from "@/components/loans/use-loan-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addCopiesAction, deleteBookAction } from "@/server/actions/books";

type Member = { id: string; name: string | null; email: string | null };

/** Librarian tools on the book page: edit, add a copy, lend to a member, delete. */
export function BookDeskPanel({
  bookId,
  title,
  openLoans,
  available,
  members,
}: {
  bookId: string;
  title: string;
  openLoans: number;
  available: number;
  members: Member[];
}) {
  const router = useRouter();
  const loanActions = useLoanActions();
  const [memberId, setMemberId] = useState<string>("");
  const [deleting, startDelete] = useTransition();
  const [adding, startAdd] = useTransition();
  const member = members.find((m) => m.id === memberId);

  return (
    <section aria-labelledby="desk-heading" className="rounded-2xl border border-border bg-surface p-5">
      <h2 id="desk-heading" className="text-xs font-bold tracking-[0.08em] text-ink-3 uppercase">
        Library desk
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href={`/admin/books/${bookId}/edit`}>
            <Pencil /> Edit details
          </Link>
        </Button>
        <Button
          variant="outline"
          disabled={adding}
          onClick={() =>
            startAdd(async () => {
              const result = await addCopiesAction(bookId, 1);
              if (result.ok) toast.success(`Added a copy · ${result.data.totalCopies} in total`);
              else toast.error(result.error);
            })
          }
        >
          {adding ? <Loader2 className="animate-spin" /> : <Plus />} Add a copy
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={openLoans > 0} title={openLoans > 0 ? "Return all copies first" : undefined}>
              <Trash2 /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the book, its holds and its loan history. It can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={(event) => {
                  event.preventDefault();
                  startDelete(async () => {
                    const result = await deleteBookAction(bookId);
                    if (result.ok) {
                      toast.success(`Deleted “${result.data.title}”`);
                      router.push("/");
                    } else {
                      toast.error(result.error);
                    }
                  });
                }}
              >
                {deleting && <Loader2 className="animate-spin" />}
                Delete book
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      {openLoans > 0 && (
        <p className="mt-2 text-[13px] text-ink-3">
          Delete is disabled while {openLoans === 1 ? "a copy is" : `${openLoans} copies are`} on loan.
        </p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-sm font-semibold">Lend to a member</p>
        <div className="flex flex-wrap gap-2">
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger className="h-11 min-w-56 flex-1 rounded-xl" aria-label="Choose a member">
              <SelectValue placeholder="Choose a member…" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!memberId || loanActions.pending || available === 0}
            onClick={async () => {
              const ok = await loanActions.borrow(bookId, { memberId, memberName: member?.name ?? undefined });
              if (ok) setMemberId("");
            }}
          >
            {loanActions.pending ? <Loader2 className="animate-spin" /> : <UserRoundPlus />}
            Lend
          </Button>
        </div>
        {available === 0 && (
          <p className="mt-2 text-[13px] text-ink-3">No free copies right now (members with a ready hold can still borrow).</p>
        )}
      </div>
    </section>
  );
}
