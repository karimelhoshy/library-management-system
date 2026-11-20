/**
 * Write tools. None of them changes anything: each checks the request, then puts a
 * confirmation card in front of the member (see resolveProposalAction).
 */
import { z } from "zod";
import { LOAN_DAYS } from "@/lib/config";
import { getBookCards } from "@/server/services/catalog";
import { listMyLoans } from "@/server/services/loans";
import { checkRenewal, dueDateFrom, formatShortDate } from "@/server/services/rules";
import { bookIdArg, bookIdSchema, defineTool, loadBook, propose, remember } from "./shared";

const placeHold = defineTool({
  name: "place_hold",
  description:
    "Propose placing a hold on a book with no copies available. Shows the member a confirmation card; nothing happens until they confirm.",
  status: "Preparing a hold…",
  permission: "hold:self",
  args: bookIdArg,
  parameters: bookIdSchema,
  async run(args, ctx) {
    const book = await loadBook(ctx, args.book_id);
    if (!book) return { error: "No book with that id." };
    if (book.myLoanId) return { error: "The member already has this book on loan." };
    if (book.myHoldStatus) return { error: "The member already has a hold on this book." };
    if (book.available > 0) {
      return { error: "A copy is available right now, so propose borrow_book instead of a hold." };
    }
    const position = book.waitingHolds + 1;
    return propose(ctx, {
      kind: "place_hold",
      bookId: book.id,
      title: book.title,
      detail:
        (position === 1 ? "You'd be first in line" : `You'd be #${position} in line`) +
        (book.nextDueAt ? `. The next copy is due back ${formatShortDate(book.nextDueAt)}.` : "."),
    });
  },
});

const borrowBook = defineTool({
  name: "borrow_book",
  description: `Propose borrowing a book for the member (${LOAN_DAYS}-day loan). Shows a confirmation card; nothing happens until they confirm.`,
  status: "Preparing the loan…",
  permission: "loan:self",
  args: bookIdArg,
  parameters: bookIdSchema,
  async run(args, ctx) {
    const book = await loadBook(ctx, args.book_id);
    if (!book) return { error: "No book with that id." };
    if (book.myLoanId) return { error: "The member already has this book on loan." };
    if (book.available === 0 && book.myHoldStatus !== "ready") {
      return { error: "No copies are free. Offer place_hold instead." };
    }
    return propose(ctx, {
      kind: "borrow_book",
      bookId: book.id,
      title: book.title,
      detail: `${LOAN_DAYS}-day loan, due back ${formatShortDate(dueDateFrom(new Date()))}.`,
    });
  },
});

const renewLoan = defineTool({
  name: "renew_loan",
  description: `Propose renewing one of the member's loans for ${LOAN_DAYS} more days (allowed once, only if nobody is waiting). Shows a confirmation card.`,
  status: "Checking the renewal…",
  permission: "loan:self",
  args: z.object({ loan_id: z.string().uuid() }),
  parameters: {
    type: "object",
    properties: { loan_id: { type: "string", description: "The loan_id from my_loans." } },
    required: ["loan_id"],
  },
  async run(args, ctx) {
    const loans = await listMyLoans(ctx.user.id);
    const loan = loans.find((l) => l.id === args.loan_id);
    if (!loan) return { error: "That isn't one of the member's open loans." };
    const check = checkRenewal(loan, loan.waitingHolds);
    if (!check.ok) return { error: check.reason };
    remember(ctx, await getBookCards([loan.bookId], ctx.user.id));
    return propose(ctx, {
      kind: "renew_loan",
      bookId: loan.bookId,
      loanId: loan.id,
      title: loan.title,
      detail: `New due date: ${formatShortDate(check.newDueAt)} (was ${formatShortDate(loan.dueAt)}).`,
    });
  },
});

export const PROPOSAL_TOOLS = [placeHold, borrowBook, renewLoan];
