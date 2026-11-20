/** Public, non-secret configuration that is safe to use on the client. */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Shelfwise";

/** Default loan period in days. */
export const LOAN_DAYS = 14;
/** How long a ready hold is kept for the member before passing to the next person. */
export const HOLD_READY_DAYS = 3;
/** Number of renewals allowed per loan. */
export const MAX_RENEWALS = 1;
/** Window in which a borrow or return can be undone from the toast. */
export const UNDO_WINDOW_SECONDS = 120;

/** Primary genres shown in the catalog filter. Books can carry extra tags too. */
export const PRIMARY_GENRES = [
  "Literary Fiction",
  "Mystery",
  "Science Fiction",
  "Fantasy",
  "Humor",
  "History",
  "Memoir",
  "Science",
] as const;
