import { desc, eq } from "drizzle-orm";
import { APP_NAME } from "@/lib/config";
import { db } from "@/server/db";
import { emailOutbox } from "@/server/db/schema";
import { fromAddress, getTransport } from "./transport";

export type SendEmailInput = {
  toUserId: string | null;
  toEmail: string;
  subject: string;
  html: string;
  kind: "hold_ready" | "due_soon" | "overdue";
  /** Same key twice means "already sent", e.g. `due_soon:<loanId>`. */
  dedupeKey?: string;
};

/** Addresses we never deliver to: seeded demo users and other placeholder domains. */
export function isUndeliverable(email: string): boolean {
  return /@(example\.(com|org|net)|.+\.(test|invalid|example))$/i.test(email);
}

/**
 * Every email is written to the outbox (visible to librarians), whether it was
 * sent, skipped (demo address / email not configured) or failed.
 */
export async function sendEmail(input: SendEmailInput): Promise<"sent" | "skipped" | "failed" | "duplicate"> {
  if (input.dedupeKey) {
    const [existing] = await db
      .select({ id: emailOutbox.id })
      .from(emailOutbox)
      .where(eq(emailOutbox.dedupeKey, input.dedupeKey));
    if (existing) return "duplicate";
  }

  let status: "sent" | "skipped" | "failed" = "skipped";
  let error: string | null = null;
  const transport = getTransport();

  if (isUndeliverable(input.toEmail)) {
    error = "Demo address: recorded in the outbox only.";
  } else if (!transport) {
    error = "Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD).";
  } else {
    try {
      await transport.sendMail({
        from: fromAddress(APP_NAME),
        to: input.toEmail,
        subject: input.subject,
        html: input.html,
      });
      status = "sent";
    } catch (cause) {
      status = "failed";
      error = cause instanceof Error ? cause.message.slice(0, 300) : "Unknown error";
      console.error("[email] send failed", cause);
    }
  }

  await db
    .insert(emailOutbox)
    .values({
      toUserId: input.toUserId,
      toEmail: input.toEmail,
      subject: input.subject,
      bodyHtml: input.html,
      kind: input.kind,
      status,
      error,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: emailOutbox.dedupeKey });

  return status;
}

export async function listOutbox(limit = 100) {
  return db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(limit);
}
