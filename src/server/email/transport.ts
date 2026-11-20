import nodemailer, { type Transporter } from "nodemailer";
import { isEmailEnabled } from "@/server/env";

let transporter: Transporter | null = null;

/** Gmail SMTP via an app password. Returns null when email isn't configured. */
export function getTransport(): Transporter | null {
  if (!isEmailEnabled()) return null;
  transporter ??= nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  return transporter;
}

export function fromAddress(appName: string): string {
  return `"${appName}" <${process.env.GMAIL_USER}>`;
}
