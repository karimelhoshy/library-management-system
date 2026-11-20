import { describe, expect, it } from "vitest";
import { ACTIONS, assertCan, can, ForbiddenError, type Action } from "@/server/auth/permissions";

const expected: Record<"member" | "librarian" | "admin", Action[]> = {
  member: ["catalog:read", "loan:self", "hold:self", "ai:chat"],
  librarian: ["catalog:read", "loan:self", "hold:self", "ai:chat", "book:write", "loan:any", "desk:read"],
  admin: [...ACTIONS],
};

describe("can()", () => {
  for (const [role, allowed] of Object.entries(expected) as [keyof typeof expected, Action[]][]) {
    for (const action of ACTIONS) {
      const should = allowed.includes(action);
      it(`${role} ${should ? "can" : "cannot"} ${action}`, () => {
        expect(can({ role }, action)).toBe(should);
      });
    }
  }

  it("denies everything when signed out", () => {
    for (const action of ACTIONS) expect(can(null, action)).toBe(false);
  });

  it("only admins manage users", () => {
    expect(can({ role: "librarian" }, "user:manage")).toBe(false);
    expect(can({ role: "admin" }, "user:manage")).toBe(true);
  });
});

describe("assertCan()", () => {
  it("throws a 403 ForbiddenError when not allowed", () => {
    expect(() => assertCan({ id: "u1", role: "member" }, "book:write")).toThrow(ForbiddenError);
    try {
      assertCan({ id: "u1", role: "member" }, "desk:read");
    } catch (error) {
      expect((error as ForbiddenError).status).toBe(403);
    }
  });

  it("passes when allowed", () => {
    expect(() => assertCan({ id: "u1", role: "librarian" }, "book:write")).not.toThrow();
  });
});
