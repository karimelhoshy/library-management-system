/**
 * Tools the Ask-the-Librarian agent can call. Each maps to a domain service and a
 * `can()` check, exactly like the server actions. Lookups live in lookup.ts; write
 * tools in proposals.ts only ever return a card the member has to confirm.
 */
import { z } from "zod";
import { assertCan, ForbiddenError } from "@/server/auth/permissions";
import { LOOKUP_TOOLS } from "./lookup";
import { PROPOSAL_TOOLS } from "./proposals";
import type { ToolContext } from "./shared";

export type { ToolContext } from "./shared";

export const TOOLS = [...LOOKUP_TOOLS, ...PROPOSAL_TOOLS];

export const TOOL_DECLARATIONS = TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.parameters,
}));

export function toolStatus(name: string): string {
  return TOOLS.find((tool) => tool.name === name)?.status ?? "Working on it…";
}

/** Runs a tool call from the model: validates args, checks permission, never throws. */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<unknown> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { error: `Unknown tool ${name}.` };
  try {
    assertCan(ctx.user, tool.permission);
    const args = tool.args.parse(rawArgs ?? {});
    return await (tool.run as (a: unknown, c: ToolContext) => Promise<unknown>)(args, ctx);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: `Invalid arguments: ${error.issues[0]?.message}` };
    if (error instanceof ForbiddenError) return { error: "Not allowed for this member." };
    console.error(`[ai] tool ${name} failed`, error);
    return { error: "That lookup failed. Try a different approach." };
  }
}
