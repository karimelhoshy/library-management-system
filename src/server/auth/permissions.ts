import type { Role } from "@/server/db/schema";

/**
 * Every permission check in the app goes through `can()`.
 * The UI hides what a role can't do, but these checks on the server are the real gate.
 */
export const ACTIONS = [
  "catalog:read", // browse, search, view books
  "loan:self", // borrow / return / renew own loans
  "hold:self", // place / cancel own holds
  "ai:chat", // Ask the Librarian
  "book:write", // add / edit / delete books, ISBN add, shelf-photo import
  "loan:any", // borrow or return on behalf of any member, see all loans
  "desk:read", // dashboard, activity log, email outbox
  "user:manage", // manage users and roles
] as const;

export type Action = (typeof ACTIONS)[number];

const MEMBER: Action[] = ["catalog:read", "loan:self", "hold:self", "ai:chat"];
const LIBRARIAN: Action[] = [...MEMBER, "book:write", "loan:any", "desk:read"];
const ADMIN: Action[] = [...LIBRARIAN, "user:manage"];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  member: new Set(MEMBER),
  librarian: new Set(LIBRARIAN),
  admin: new Set(ADMIN),
};

export type Actor = { id: string; role: Role; isDemo?: boolean };

export function can(user: Pick<Actor, "role"> | null | undefined, action: Action): boolean {
  if (!user) return false;
  return MATRIX[user.role]?.has(action) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  librarian: "Librarian",
  member: "Member",
};

/** Thrown by services when the actor lacks a permission. Mapped to HTTP 403. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Thrown by services for expected business-rule failures (shown to the user). */
export class DomainError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

export function assertCan(user: Actor | null | undefined, action: Action): asserts user is Actor {
  if (!can(user, action)) throw new ForbiddenError();
}
