import type { Role } from "@/server/db/schema";

/** Seeded demo accounts. They exist (and can be signed into) only when DEMO_MODE=true. */
export const DEMO_USERS = [
  {
    id: "demo-ada",
    name: "Ada Okafor",
    email: "ada@example.com",
    role: "admin",
    pitch: "Manage people and roles, plus everything a librarian can do.",
  },
  {
    id: "demo-leo",
    name: "Leo Brandt",
    email: "leo@example.com",
    role: "librarian",
    pitch: "Add books by ISBN or shelf photo, run the loans desk, see the dashboard.",
  },
  {
    id: "demo-maya",
    name: "Maya Chen",
    email: "maya@example.com",
    role: "member",
    pitch: "Browse and borrow. Has one overdue loan and a hold ready to pick up.",
  },
  {
    id: "demo-sam",
    name: "Sam Rivera",
    email: "sam@example.com",
    role: "member",
    pitch: "A brand-new member with no history yet.",
  },
] as const satisfies readonly { id: string; name: string; email: string; role: Role; pitch: string }[];

export type DemoUserId = (typeof DEMO_USERS)[number]["id"];

export function isDemoUserId(id: string): id is DemoUserId {
  return DEMO_USERS.some((user) => user.id === id);
}
