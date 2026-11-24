/**
 * Loan rules against a real Postgres (with pgvector + pg_trgm).
 * Runs when TEST_DATABASE_URL is set, e.g.:
 *   TEST_DATABASE_URL=postgres://shelfwise:shelfwise@localhost:54329/shelfwise_test pnpm test
 * The database is wiped between tests: never point this at real data.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("loans and holds (integration)", () => {
  let mod: {
    db: typeof import("@/server/db");
    schema: typeof import("@/server/db/schema");
    loans: typeof import("@/server/services/loans");
    holds: typeof import("@/server/services/holds");
    books: typeof import("@/server/services/books");
    perms: typeof import("@/server/auth/permissions");
  };
  const member = (id: string) => ({ id, role: "member" as const });
  const librarian = { id: "it-librarian", role: "librarian" as const };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    delete process.env.GEMINI_API_KEY;
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    mod = {
      db: await import("@/server/db"),
      schema: await import("@/server/db/schema"),
      loans: await import("@/server/services/loans"),
      holds: await import("@/server/services/holds"),
      books: await import("@/server/services/books"),
      perms: await import("@/server/auth/permissions"),
    };
    await migrate(mod.db.db, { migrationsFolder: "src/server/db/migrations" });
  });

  afterAll(async () => {
    await mod?.db.pool.end();
  });

  beforeEach(async () => {
    const { db } = mod.db;
    const s = mod.schema;
    await db.delete(s.emailOutbox);
    await db.delete(s.activityLog);
    await db.delete(s.holds);
    await db.delete(s.loans);
    await db.delete(s.books);
    await db.delete(s.users);
    await db.insert(s.users).values([
      { id: "it-ana", name: "Ana", email: "ana@example.com" },
      { id: "it-ben", name: "Ben", email: "ben@example.com" },
      { id: "it-cy", name: "Cy", email: "cy@example.com" },
      { id: "it-librarian", name: "Lib", email: "lib@example.com", role: "librarian" },
    ]);
  });

  async function makeBook(copies: number) {
    return mod.books.createBook(librarian, { title: "Test Book", authors: ["A. Writer"], totalCopies: copies });
  }

  it("two people can't both take the last copy", async () => {
    const book = await makeBook(1);
    const results = await Promise.allSettled([
      mod.loans.borrowBook(member("it-ana"), { bookId: book.id }),
      mod.loans.borrowBook(member("it-ben"), { bookId: book.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(mod.perms.DomainError);
    const open = await mod.loans.listActiveLoans(librarian);
    expect(open).toHaveLength(1);
  });

  it("can't borrow the same title twice", async () => {
    const book = await makeBook(3);
    await mod.loans.borrowBook(member("it-ana"), { bookId: book.id });
    await expect(mod.loans.borrowBook(member("it-ana"), { bookId: book.id })).rejects.toThrow(/already/);
  });

  it("a return hands the copy to the first person waiting", async () => {
    const book = await makeBook(1);
    const loan = await mod.loans.borrowBook(member("it-ana"), { bookId: book.id });
    await expect(mod.loans.borrowBook(member("it-ben"), { bookId: book.id })).rejects.toThrow(/hold/);
    const benHold = await mod.holds.placeHold(member("it-ben"), book.id);
    const cyHold = await mod.holds.placeHold(member("it-cy"), book.id);
    expect(benHold.position).toBe(1);
    expect(cyHold.position).toBe(2);

    // Someone is waiting, so Ana can't renew.
    await expect(mod.loans.renewLoan(member("it-ana"), loan.loanId)).rejects.toThrow(/waiting/);

    const returned = await mod.loans.returnLoan(member("it-ana"), loan.loanId);
    expect(returned.promoted.map((p) => p.userId)).toEqual(["it-ben"]);

    // The copy is set aside: Cy can't take it, Ben can.
    await expect(mod.loans.borrowBook(member("it-cy"), { bookId: book.id })).rejects.toThrow();
    await mod.loans.borrowBook(member("it-ben"), { bookId: book.id });
    const benHolds = await mod.holds.listMyHolds("it-ben");
    expect(benHolds).toHaveLength(0); // fulfilled
  });

  it("members can't return other people's loans; librarians can", async () => {
    const book = await makeBook(1);
    const loan = await mod.loans.borrowBook(member("it-ana"), { bookId: book.id });
    await expect(mod.loans.returnLoan(member("it-ben"), loan.loanId)).rejects.toBeInstanceOf(
      mod.perms.ForbiddenError,
    );
    await expect(mod.loans.returnLoan(librarian, loan.loanId)).resolves.toMatchObject({ title: "Test Book" });
  });

  it("members can't lend on behalf of others", async () => {
    const book = await makeBook(1);
    await expect(
      mod.loans.borrowBook(member("it-ana"), { bookId: book.id, memberId: "it-ben" }),
    ).rejects.toBeInstanceOf(mod.perms.ForbiddenError);
    await expect(mod.loans.borrowBook(librarian, { bookId: book.id, memberId: "it-ben" })).resolves.toBeTruthy();
  });

  it("renews once, then refuses", async () => {
    const book = await makeBook(2);
    const loan = await mod.loans.borrowBook(member("it-ana"), { bookId: book.id });
    const renewed = await mod.loans.renewLoan(member("it-ana"), loan.loanId);
    expect(renewed.dueAt.getTime()).toBeGreaterThan(loan.dueAt.getTime());
    await expect(mod.loans.renewLoan(member("it-ana"), loan.loanId)).rejects.toThrow(/once/);
  });

  it("blocks deleting a book while a copy is on loan", async () => {
    const book = await makeBook(1);
    const loan = await mod.loans.borrowBook(member("it-ana"), { bookId: book.id });
    await expect(mod.books.deleteBook(librarian, book.id)).rejects.toThrow(/on loan/);
    await mod.loans.returnLoan(member("it-ana"), loan.loanId);
    await expect(mod.books.deleteBook(librarian, book.id)).resolves.toEqual({ title: "Test Book" });
  });

  it("undoing a borrow that used a ready hold gives the hold back", async () => {
    const book = await makeBook(1);
    const loan = await mod.loans.borrowBook(member("it-ana"), { bookId: book.id });
    await mod.holds.placeHold(member("it-ben"), book.id);
    await mod.holds.placeHold(member("it-cy"), book.id);
    await mod.loans.returnLoan(member("it-ana"), loan.loanId); // Ben's hold is now ready

    const benLoan = await mod.loans.borrowBook(member("it-ben"), { bookId: book.id });
    await mod.loans.undoBorrow(member("it-ben"), benLoan.loanId);

    // The copy is still Ben's, not the next person's.
    expect((await mod.holds.listMyHolds("it-ben")).map((h) => h.status)).toEqual(["ready"]);
    await expect(mod.loans.borrowBook(member("it-cy"), { bookId: book.id })).rejects.toThrow(/hold/);
    await expect(mod.loans.borrowBook(member("it-ben"), { bookId: book.id })).resolves.toBeTruthy();
  });

  it("won't cut copies below those on loan or set aside for a hold", async () => {
    const book = await makeBook(2);
    const loan = await mod.loans.borrowBook(member("it-ana"), { bookId: book.id });
    await mod.loans.borrowBook(member("it-ben"), { bookId: book.id });
    await mod.holds.placeHold(member("it-cy"), book.id);
    await mod.loans.returnLoan(member("it-ana"), loan.loanId); // set aside for Cy
    const edit = { title: "Test Book", authors: ["A. Writer"], totalCopies: 1 };
    await expect(mod.books.updateBook(librarian, book.id, edit)).rejects.toThrow(/set aside for holds/);
  });

  it("undo borrow removes a fresh loan and frees the copy", async () => {
    const book = await makeBook(1);
    const loan = await mod.loans.borrowBook(member("it-ana"), { bookId: book.id });
    await mod.loans.undoBorrow(member("it-ana"), loan.loanId);
    await expect(mod.loans.borrowBook(member("it-ben"), { bookId: book.id })).resolves.toBeTruthy();
  });
});
