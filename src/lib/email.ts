/**
 * HTML- und Plain-Text-Vorlagen für ausgehende E-Mails des Admin-Panels.
 *
 * Design-Leitplanken:
 *  - Pur-HTML mit Table-Layouts (für maximale Kompatibilität in E-Mail-Clients)
 *  - Inline-Styles + bgcolor-Attribute (Outlook/Gmail)
 *  - Logo als undurchsichtiges PNG (weiss auf Marine) per Data-URI,
 *    damit es ohne Nachladen in Hell und Dunkel sichtbar bleibt
 *  - Eigene Farben fuer prefers-color-scheme: dark, damit iPhone-Mail
 *    den Text nicht dunkel auf dunkel stellt
 */

import { EMAIL_MARK_PNG_BASE64 } from "./email-mark";

export interface ReplyEmailInput {
  siteName: string;
  siteUrl: string;
  recipientName: string;
  subject: string;
  bodyText: string;
  authorName: string;
  fromEmail: string;
  phone?: string | null;
  replyToEmail?: string | null;
}

export interface EmailAttachment {
  content: string;
  filename: string;
  type: string;
  disposition: "attachment" | "inline";
  contentId?: string;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtmlParagraphs(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  return normalized
    .split(/\n{2,}/)
    .map(
      (block) =>
        `<p class="email-text" style="margin:0 0 14px 0;line-height:1.6;color:#1e293b;font-size:16px;">${escapeHtml(
          block,
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

export function renderReplyEmailHtml(input: ReplyEmailInput): string {
  const safeSubject = escapeHtml(input.subject);
  const safeRecipient = escapeHtml(input.recipientName);
  const safeAuthor = escapeHtml(input.authorName);
  const safeFrom = escapeHtml(input.replyToEmail || input.fromEmail);
  const safeSite = escapeHtml(input.siteName);
  const safeSiteUrl = escapeHtml(input.siteUrl);
  const displayUrl = input.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const safePhone = input.phone ? escapeHtml(input.phone) : "";
  const telHref = input.phone ? input.phone.replace(/\s+/g, "") : "";
  const bodyHtml = textToHtmlParagraphs(input.bodyText);
  const logoSrc = `data:image/png;base64,${EMAIL_MARK_PNG_BASE64}`;

  return `<!doctype html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${safeSubject}</title>
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      @media (prefers-color-scheme: dark) {
        .email-outer, .email-outer td { background-color: #0b1220 !important; }
        .email-card, .email-card td.email-copy, .email-card td.email-footer { background-color: #162033 !important; }
        .email-outer td.email-header { background-color: #0e172a !important; color: #ffffff !important; }
        .email-text, .email-copy, .email-copy p, .email-copy h1, .email-copy span { color: #f8fafc !important; }
        .email-muted { color: #cbd5e1 !important; }
        .email-help, .email-help td { background-color: #1e293b !important; border-color: #334155 !important; }
        .email-link { color: #bfdbfe !important; }
        .email-footer, .email-footer p, .email-footer a { color: #cbd5e1 !important; }
        .email-rule { border-top-color: #334155 !important; }
      }
    </style>
  </head>
  <body class="email-outer" bgcolor="#e8eef6" style="margin:0;padding:0;background-color:#e8eef6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-outer" bgcolor="#e8eef6" style="background-color:#e8eef6;">
      <tr>
        <td align="center" bgcolor="#e8eef6" style="background-color:#e8eef6;padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" bgcolor="#ffffff" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:18px;overflow:hidden;">
            <tr>
              <td class="email-header" bgcolor="#0e172a" align="left" style="background-color:#0e172a;padding:28px 28px 22px 28px;">
                <img src="${logoSrc}" alt="${safeSite}" width="240" height="97" style="display:block;border:0;outline:none;text-decoration:none;width:240px;max-width:100%;height:auto;background-color:#0e172a;" />
              </td>
            </tr>
            <tr>
              <td class="email-copy" bgcolor="#ffffff" style="padding:28px 28px 8px 28px;background-color:#ffffff;">
                <p class="email-muted" style="margin:0 0 8px 0;color:#64748b;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">Antwort auf Ihre Anfrage</p>
                <h1 class="email-text" style="margin:0 0 22px 0;color:#0f172a;font-size:22px;line-height:1.35;font-weight:800;">${safeSubject}</h1>
                <p class="email-text" style="margin:0 0 16px 0;color:#1e293b;font-size:16px;line-height:1.6;">Hallo ${safeRecipient},</p>
                ${bodyHtml}
                <p class="email-text" style="margin:22px 0 4px 0;color:#1e293b;font-size:16px;line-height:1.6;">Mit freundlichen Grüßen</p>
                <p class="email-text" style="margin:0;color:#0f172a;font-size:16px;line-height:1.6;font-weight:700;">${safeAuthor}</p>
                <p class="email-muted" style="margin:2px 0 0 0;color:#64748b;font-size:14px;">${safeSite}</p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" class="email-copy" style="padding:8px 28px 24px 28px;background-color:#ffffff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-help" bgcolor="#f1f5f9" style="background-color:#f1f5f9;border-radius:14px;border:1px solid #e2e8f0;">
                  <tr>
                    <td bgcolor="#f1f5f9" class="email-help" style="padding:16px 18px;background-color:#f1f5f9;">
                      <p class="email-muted" style="margin:0 0 6px 0;color:#64748b;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;">Fragen?</p>
                      <p class="email-text" style="margin:0;color:#1e293b;font-size:15px;line-height:1.6;">
                        Antworten Sie einfach auf diese E-Mail. Wir sind unter
                        <a class="email-link" href="mailto:${safeFrom}" style="color:#1d4ed8;text-decoration:underline;">${safeFrom}</a>
                        ${safePhone ? ` oder telefonisch unter <a class="email-link" href="tel:${telHref}" style="color:#1d4ed8;text-decoration:underline;">${safePhone}</a>` : ""}
                        für Sie erreichbar.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="email-footer" bgcolor="#ffffff" style="padding:0 28px 24px 28px;background-color:#ffffff;">
                <p class="email-rule" style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px 0;line-height:0;font-size:0;">&nbsp;</p>
                <p class="email-muted" style="margin:0;color:#64748b;font-size:13px;line-height:1.55;">
                  ${safeSite} · <a class="email-link" href="${safeSiteUrl}" style="color:#64748b;text-decoration:underline;">${displayUrl}</a><br />
                  Diese E-Mail wurde als Antwort auf Ihre Anfrage über unser Kontaktformular versendet.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderReplyEmailText(input: ReplyEmailInput): string {
  const contactEmail = input.replyToEmail || input.fromEmail;
  const lines = [
    `Hallo ${input.recipientName},`,
    "",
    input.bodyText.trim(),
    "",
    "Mit freundlichen Grüßen",
    input.authorName,
    input.siteName,
    "",
    "---",
    `Fragen? E-Mail: ${contactEmail}` +
      (input.phone ? ` · Telefon: ${input.phone}` : ""),
    `Website: ${input.siteUrl}`,
  ];
  return lines.join("\n");
}

export interface SendInput {
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  via: "cloudflare" | "resend" | "none";
  messageId?: string;
  error?: string;
}

const ALLOWED_SEND_HEADERS = new Set(["in-reply-to", "references"]);

function allowlistedHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) return undefined;
  const allowed: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!ALLOWED_SEND_HEADERS.has(name.toLowerCase())) continue;
    const trimmed = value.trim();
    if (!trimmed || /[\r\n]/.test(trimmed)) continue;
    allowed[name] = trimmed;
  }
  return Object.keys(allowed).length > 0 ? allowed : undefined;
}

/**
 * Cloudflare-Email-Sending-Binding (`env.EMAIL` → `send_email` in wrangler.jsonc).
 */
export async function sendViaCloudflare(
  binding: SendEmail,
  input: SendInput,
): Promise<SendResult> {
  try {
    const headers = allowlistedHeaders(input.headers);
    const result = await binding.send({
      from: input.fromName
        ? { email: input.from, name: input.fromName }
        : input.from,
      to: input.toName
        ? { email: input.to, name: input.toName }
        : input.to,
      replyTo: input.replyTo ?? input.from,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
      ...(headers ? { headers } : {}),
    });
    return {
      ok: true,
      via: "cloudflare",
      messageId: result.messageId,
    };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return {
      ok: false,
      via: "cloudflare",
      error: `${e.code ?? "unknown"}: ${e.message ?? String(err)}`.slice(0, 500),
    };
  }
}

/**
 * Resend-HTTP-Fallback. Nur wenn `env.RESEND_API_KEY` gesetzt ist.
 */
export async function sendViaResend(
  apiKey: string,
  input: SendInput,
): Promise<SendResult> {
  try {
    const payload: Record<string, unknown> = {
      from: input.fromName ? `${input.fromName} <${input.from}>` : input.from,
      to: [input.to],
      reply_to: input.replyTo ?? input.from,
      subject: input.subject,
      html: input.html,
      text: input.text,
    };
    const headers = allowlistedHeaders(input.headers);
    if (headers) payload.headers = headers;
    if (input.attachments?.length) {
      payload.attachments = input.attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        content_type: att.type,
        content_id: att.contentId,
      }));
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      return {
        ok: false,
        via: "resend",
        error: `${response.status}: ${bodyText.slice(0, 400)}`,
      };
    }

    const body = (await response.json()) as { id?: string };
    return { ok: true, via: "resend", messageId: body.id };
  } catch (err) {
    return {
      ok: false,
      via: "resend",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * High-Level Send: nutzt Cloudflare Email Sending wenn verfuegbar,
 * sonst Resend, sonst „none".
 */
export async function sendEmail(
  env: Env,
  input: SendInput,
): Promise<SendResult> {
  if (env.EMAIL) {
    return sendViaCloudflare(env.EMAIL, input);
  }
  if (env.RESEND_API_KEY) {
    return sendViaResend(env.RESEND_API_KEY, input);
  }
  return { ok: false, via: "none", error: "Kein E-Mail-Transport konfiguriert." };
}
