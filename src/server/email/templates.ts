import { APP_NAME } from "@/lib/config";
import { formatShortDate } from "@/server/services/rules";
import { appUrl } from "@/server/env";

export type EmailContent = { subject: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(opts: { heading: string; body: string; cta?: { label: string; href: string } }) {
  const cta = opts.cta
    ? `<p style="margin:28px 0 8px"><a href="${opts.cta.href}" style="display:inline-block;background:#4F46E5;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;background:#FAFAF7;font-family:'Plus Jakarta Sans',Segoe UI,Helvetica,Arial,sans-serif;color:#1C1917">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #E7E5E0;border-radius:16px;padding:32px">
        <tr><td>
          <p style="margin:0 0 24px;font-weight:800;font-size:16px;color:#4F46E5">${escapeHtml(APP_NAME)}</p>
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:800;letter-spacing:-0.02em">${escapeHtml(opts.heading)}</h1>
          <div style="font-size:15px;line-height:1.6;color:#57534E">${opts.body}</div>
          ${cta}
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#78716C">You're receiving this because you have an account at ${escapeHtml(APP_NAME)}.</p>
    </td></tr>
  </table>
</body></html>`;
}

const greet = (name: string | null) => `Hi ${escapeHtml(name?.split(" ")[0] ?? "there")},`;

export function holdReadyEmail(input: {
  name: string | null;
  title: string;
  bookId: string;
  readyUntil: Date;
}): EmailContent {
  return {
    subject: `Your hold is ready: ${input.title}`,
    html: layout({
      heading: "Your hold is ready to pick up",
      body: `<p>${greet(input.name)}</p><p>Good news: a copy of <strong>${escapeHtml(input.title)}</strong> is set aside for you until <strong>${formatShortDate(input.readyUntil)}</strong>. After that it passes to the next person in line.</p>`,
      cta: { label: "Borrow it now", href: `${appUrl()}/books/${input.bookId}` },
    }),
  };
}

export function dueSoonEmail(input: { name: string | null; title: string; dueAt: Date }): EmailContent {
  return {
    subject: `Due soon: ${input.title}`,
    html: layout({
      heading: `${input.title} is due ${formatShortDate(input.dueAt)}`,
      body: `<p>${greet(input.name)}</p><p>A friendly reminder that <strong>${escapeHtml(input.title)}</strong> is due back on <strong>${formatShortDate(input.dueAt)}</strong>. If nobody is waiting for it, you can renew it once for another two weeks.</p>`,
      cta: { label: "View my loans", href: `${appUrl()}/loans` },
    }),
  };
}

export function overdueEmail(input: { name: string | null; title: string; dueAt: Date }): EmailContent {
  return {
    subject: `Overdue: ${input.title}`,
    html: layout({
      heading: `${input.title} is overdue`,
      body: `<p>${greet(input.name)}</p><p><strong>${escapeHtml(input.title)}</strong> was due back on <strong>${formatShortDate(input.dueAt)}</strong>. Please return it when you can so the next reader can enjoy it.</p>`,
      cta: { label: "View my loans", href: `${appUrl()}/loans` },
    }),
  };
}
