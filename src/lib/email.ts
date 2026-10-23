/**
 * HTML- und Plain-Text-Vorlagen für ausgehende E-Mails des Admin-Panels.
 *
 * Design-Leitplanken:
 *  - Pur-HTML mit Table-Layouts (für maximale Kompatibilität in E-Mail-Clients)
 *  - Inline-Styles + bgcolor-Attribute (Outlook/Gmail)
 *  - Logo als Inline-CID (Gmail strippt data:-URIs)
 *  - color-scheme: light only + linear-gradient-Hintergründe, damit Gmail
 *    im Dark Mode die Karte nicht invertiert (heller Header / dunkler Body)
 */

import { EMAIL_MARK_PNG_BASE64 } from "./email-mark";
import { htmlToPlainText, sanitizeMailHtml } from "./mail-html";

/** CID fürs Header-Logo. Gmail blockiert data:-URIs im HTML. */
export const EMAIL_LOGO_CID = "zeus-email-logo";

export interface ReplyEmailInput {
  siteName: string;
  siteUrl: string;
  recipientName: string;
  subject: string;
  /** Sichtbare Überschrift. Ohne Angabe steht dort der Betreff. */
  heading?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
  authorName: string;
  fromEmail: string;
  phone?: string | null;
  replyToEmail?: string | null;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  /** Ohne Angabe bleibt die Überschrift der Anfrage-Antwort. */
  eyebrow?: string | null;
  /** `undefined` setzt „Hallo Name“, `null` lässt die Zeile weg. */
  greeting?: string | null;
  footerNote?: string | null;
  /** Zahlungsknopf steht über dem Rechnungstext. */
  ctaFirst?: boolean | null;
  /** Großer Betrag über dem Text, zum Beispiel der Rechnungsbetrag. */
  summaryLabel?: string | null;
  summaryAmount?: string | null;
  /** In der HTML-Mail nur den Knopf zeigen. Die Adresse bleibt im Text. */
  hideCtaUrl?: boolean | null;
  /** Zahlungsknopf in Grün, damit er auf dunklem Grund sichtbar bleibt. */
  ctaTone?: "green" | null;
}

export interface EmailAttachment {
  content: string | ArrayBuffer | ArrayBufferView;
  filename: string;
  type: string;
  disposition: "attachment" | "inline";
  contentId?: string;
}

const MAIL_IMPRESSUM_LINES = [
  "ZEUS-SERVICE",
  "Leon Lütcke",
  "Berliner Allee 44a",
  "22850 Norderstedt",
] as const;

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
  const safeHeading = escapeHtml(input.heading?.trim() || input.subject);
  const safeAuthor = escapeHtml(input.authorName);
  const safeFrom = escapeHtml(input.replyToEmail || input.fromEmail);
  const safeSite = escapeHtml(input.siteName);
  const safeSiteUrl = escapeHtml(input.siteUrl);
  const displayUrl = input.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const eyebrow = escapeHtml(input.eyebrow?.trim() || "Antwort auf Ihre Anfrage");
  const greetingText =
    input.greeting === undefined ? `Hallo ${input.recipientName},` : (input.greeting ?? "");
  const greetingHtml = greetingText
    ? `<p class="email-text" style="margin:0 0 16px 0;color:#1e293b;font-size:16px;line-height:1.6;">${escapeHtml(greetingText)}</p>`
    : "";
  const footerNote = escapeHtml(
    input.footerNote?.trim() ||
      "Diese E-Mail wurde als Antwort auf Ihre Anfrage über unser Kontaktformular versendet.",
  );
  const safePhone = input.phone ? escapeHtml(input.phone) : "";
  const telHref = input.phone ? input.phone.replace(/\s+/g, "") : "";
  const richHtml = input.bodyHtml ? sanitizeMailHtml(input.bodyHtml) : "";
  const bodyHtml = richHtml
    ? `<div class="email-rich email-text" style="color:#1e293b;font-size:16px;line-height:1.6;">${richHtml}</div>`
    : textToHtmlParagraphs(input.bodyText);
  const logoSrc = `cid:${EMAIL_LOGO_CID}`;
  const ctaUrl = input.ctaUrl && /^https:\/\/[^\s<>"]+$/.test(input.ctaUrl) ? input.ctaUrl : "";
  const ctaLabel = escapeHtml(input.ctaLabel?.trim() || "Termin wählen");
  const summaryAmount = input.summaryAmount?.trim() ?? "";
  const summaryLabel = input.summaryLabel?.trim() || "Gesamtbetrag";
  const summarySentence = summaryLabel.endsWith(":");
  const summaryHtml = summaryAmount
    ? summarySentence
      ? `<p class="email-text" style="margin:0 0 8px 0;color:#1e293b;font-size:16px;line-height:1.6;">${escapeHtml(summaryLabel)}</p>
       <p class="email-text" style="margin:0 0 18px 0;color:#0f172a;font-size:32px;line-height:1.15;font-weight:800;">${escapeHtml(summaryAmount)}</p>`
      : `<p class="email-muted" style="margin:0 0 4px 0;color:#64748b;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">${escapeHtml(summaryLabel)}</p>
       <p class="email-text" style="margin:0 0 18px 0;color:#0f172a;font-size:32px;line-height:1.15;font-weight:800;">${escapeHtml(summaryAmount)}</p>`
    : "";
  const ctaGreen = input.ctaTone === "green";
  const ctaBackground = ctaGreen ? "#16a34a" : "#2563eb";
  const ctaClass = ctaGreen ? "email-cta email-cta-green" : "email-cta";
  const ctaHtml = ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px 0;">
         <tr>
           <td class="${ctaClass}" bgcolor="${ctaBackground}" style="border-radius:999px;background-color:${ctaBackground};">
             <a class="${ctaClass}" href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 22px;border-radius:999px;color:#ffffff;background-color:${ctaBackground};font-size:15px;font-weight:700;text-decoration:none;-webkit-text-fill-color:#ffffff;">${ctaLabel}</a>
           </td>
         </tr>
       </table>
       ${input.hideCtaUrl ? "" : `<p class="email-muted" style="margin:0 0 14px 0;color:#64748b;font-size:13px;line-height:1.5;word-break:break-all;">${escapeHtml(ctaUrl)}</p>`}`
    : "";

  // linear-gradient + light-only: Gmail Dark Mode invertiert sonst bgcolor/#ffffff.
  const bgOuter = "background-color:#e8eef6;background-image:linear-gradient(#e8eef6,#e8eef6);";
  const bgCard = "background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff);";
  const bgHeader = "background-color:#0e172a;background-image:linear-gradient(#0e172a,#0e172a);";
  const bgHelp = "background-color:#f1f5f9;background-image:linear-gradient(#f1f5f9,#f1f5f9);";

  return `<!doctype html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>${safeSubject}</title>
    <style>
      :root { color-scheme: light only; supported-color-schemes: light; }
      .email-rich p { margin: 0 0 14px 0; }
      .email-rich ul, .email-rich ol { margin: 0 0 14px 1.2em; padding: 0; }
      .email-rich a { color: #1d4ed8; }
      .email-rich img { max-width: 100%; height: auto; border: 0; }
      u + .email-outer { background-color: #e8eef6 !important; }
      .email-outer, .email-outer td { color-scheme: light only; }
      .email-card, .email-copy, .email-footer { background-color: #ffffff !important; }
      .email-header { background-color: #0e172a !important; }
      .email-text, .email-copy, .email-copy p, .email-copy h1, .email-rich, .email-rich p, .email-rich li { color: #1e293b !important; }
      .email-copy h1.email-text { color: #0f172a !important; }
      .email-muted { color: #64748b !important; }
      .email-link { color: #1d4ed8 !important; }
      .email-help, .email-help td { background-color: #f1f5f9 !important; border-color: #e2e8f0 !important; }
      .email-outer a.email-cta { color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; }
      .email-outer a.email-cta-green { background-color: #16a34a !important; }
    </style>
  </head>
  <body class="email-outer" bgcolor="#e8eef6" style="margin:0;padding:0;${bgOuter}font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-outer" bgcolor="#e8eef6" style="${bgOuter}">
      <tr>
        <td align="center" bgcolor="#e8eef6" style="${bgOuter}padding:28px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-card" bgcolor="#ffffff" style="width:600px;max-width:100%;${bgCard}border-radius:18px;overflow:hidden;">
            <tr>
              <td class="email-header" bgcolor="#0e172a" align="left" style="${bgHeader}padding:28px 28px 22px 28px;">
                <img src="${logoSrc}" alt="${safeSite}" width="240" height="97" style="display:block;border:0;outline:none;text-decoration:none;width:240px;max-width:100%;height:auto;${bgHeader}" />
              </td>
            </tr>
            <tr>
              <td class="email-copy" bgcolor="#ffffff" style="padding:28px 28px 8px 28px;${bgCard}">
                <p class="email-muted" style="margin:0 0 8px 0;color:#64748b;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;">${eyebrow}</p>
                <h1 class="email-text" style="margin:0 0 22px 0;color:#0f172a;font-size:22px;line-height:1.35;font-weight:800;">${safeHeading}</h1>
                ${greetingHtml}
                ${summaryHtml}
                ${input.ctaFirst ? ctaHtml : ""}
                ${bodyHtml}
                ${input.ctaFirst ? "" : ctaHtml}
                <p class="email-text" style="margin:22px 0 4px 0;color:#1e293b;font-size:16px;line-height:1.6;">Mit freundlichen Grüßen</p>
                <p class="email-text" style="margin:0;color:#0f172a;font-size:16px;line-height:1.6;font-weight:700;">${safeAuthor}</p>
                <p class="email-muted" style="margin:2px 0 0 0;color:#64748b;font-size:14px;">${safeSite}</p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#ffffff" class="email-copy" style="padding:8px 28px 24px 28px;${bgCard}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="email-help" bgcolor="#f1f5f9" style="${bgHelp}border-radius:14px;border:1px solid #e2e8f0;">
                  <tr>
                    <td bgcolor="#f1f5f9" class="email-help" style="padding:16px 18px;${bgHelp}">
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
              <td class="email-footer" bgcolor="#ffffff" style="padding:0 28px 24px 28px;${bgCard}">
                <p class="email-rule" style="border:none;border-top:1px solid #e2e8f0;margin:0 0 14px 0;line-height:0;font-size:0;">&nbsp;</p>
                <p class="email-muted" style="margin:0;color:#64748b;font-size:13px;line-height:1.55;">
                  ${safeSite} · <a class="email-link" href="${safeSiteUrl}" style="color:#64748b;text-decoration:underline;">${displayUrl}</a><br />
                  ${footerNote}
                </p>
                <p class="email-muted" style="margin:10px 0 0 0;color:#94a3b8;font-size:11px;line-height:1.45;">
                  ${MAIL_IMPRESSUM_LINES.map((line) => escapeHtml(line)).join("<br />")}
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
  const greetingText =
    input.greeting === undefined ? `Hallo ${input.recipientName},` : (input.greeting ?? "");
  const ctaLines = input.ctaUrl ? [`${input.ctaLabel?.trim() || "Termin wählen"}:`, input.ctaUrl, ""] : [];
  const summaryAmount = input.summaryAmount?.trim() ?? "";
  const summaryLabel = input.summaryLabel?.trim() || "Gesamtbetrag";
  const summaryLines = summaryAmount
    ? summaryLabel.endsWith(":")
      ? [summaryLabel, summaryAmount, ""]
      : [`${summaryLabel}: ${summaryAmount}`, ""]
    : [];
  const bodyLines = [input.bodyHtml ? htmlToPlainText(input.bodyHtml) : input.bodyText.trim(), ""];
  const lines = [
    ...(greetingText ? [greetingText, ""] : []),
    ...summaryLines,
    ...(input.ctaFirst ? ctaLines : []),
    ...bodyLines,
    ...(input.ctaFirst ? [] : ctaLines),
    ...(input.footerNote?.trim() ? [input.footerNote.trim(), ""] : []),
    "Mit freundlichen Grüßen",
    input.authorName,
    input.siteName,
    "",
    "---",
    `Fragen? E-Mail: ${contactEmail}` +
      (input.phone ? ` · Telefon: ${input.phone}` : ""),
    `Website: ${input.siteUrl}`,
    "",
    ...MAIL_IMPRESSUM_LINES,
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

function attachmentBase64(content: EmailAttachment["content"]): string {
  if (typeof content === "string") return content;
  const bytes = content instanceof ArrayBuffer
    ? new Uint8Array(content)
    : new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Header-Logo als Inline-Anhang (multipart/related). */
export function emailLogoAttachment(): EmailAttachment {
  return {
    filename: "email-logo.png",
    type: "image/png",
    disposition: "inline",
    contentId: EMAIL_LOGO_CID,
    content: decodeBase64(EMAIL_MARK_PNG_BASE64),
  };
}

function withEmailLogoAttachment(
  html: string | undefined,
  attachments: EmailAttachment[] | undefined,
): EmailAttachment[] | undefined {
  if (!html?.includes(`cid:${EMAIL_LOGO_CID}`)) return attachments;
  const list = attachments ? [...attachments] : [];
  if (list.some((item) => item.contentId === EMAIL_LOGO_CID)) return list;
  list.unshift(emailLogoAttachment());
  return list;
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
        content: attachmentBase64(att.content),
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
 * High-Level Send: nutzt Cloudflare Email Sending wenn verfügbar,
 * sonst Resend, sonst „none".
 */
export async function sendEmail(
  env: Env,
  input: SendInput,
): Promise<SendResult> {
  const payload = {
    ...input,
    attachments: withEmailLogoAttachment(input.html, input.attachments),
  };
  if (env.EMAIL) {
    return sendViaCloudflare(env.EMAIL, payload);
  }
  if (env.RESEND_API_KEY) {
    return sendViaResend(env.RESEND_API_KEY, payload);
  }
  return { ok: false, via: "none", error: "Kein E-Mail-Transport konfiguriert." };
}
