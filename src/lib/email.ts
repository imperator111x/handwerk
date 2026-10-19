/**
 * HTML- und Plain-Text-Vorlagen für ausgehende E-Mails des Admin-Panels.
 *
 * Design-Leitplanken:
 *  - Pur-HTML mit Table-Layouts (für maximale Kompatibilität in E-Mail-Clients)
 *  - Inline-Styles, keine externen CSS-Dateien
 *  - Zeus-Service-Brandfarben, Logo per absoluter URL (dark variant auf
 *    dunklem Hero-Hintergrund) – wird vom Browser des Empfängers nachgeladen
 */

export interface ReplyEmailInput {
  siteName: string;
  siteUrl: string;
  recipientName: string;
  subject: string;
  bodyText: string;
  authorName: string;
  fromEmail: string;
  phone?: string | null;
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
        `<p style="margin:0 0 14px 0;line-height:1.6;color:#1f2a44;font-size:15px;">${escapeHtml(
          block,
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

export function renderReplyEmailHtml(input: ReplyEmailInput): string {
  const logoUrl = `${input.siteUrl.replace(/\/$/, "")}/logo-light.png`;
  const safeSubject = escapeHtml(input.subject);
  const safeRecipient = escapeHtml(input.recipientName);
  const safeAuthor = escapeHtml(input.authorName);
  const safeFrom = escapeHtml(input.fromEmail);
  const safeSite = escapeHtml(input.siteName);
  const safeSiteUrl = escapeHtml(input.siteUrl);
  const safePhone = input.phone ? escapeHtml(input.phone) : "";
  const bodyHtml = textToHtmlParagraphs(input.bodyText);

  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;color:#1f2a44;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:92%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(14,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#0e172a 0%,#1d2d5c 50%,#3861ce 100%);padding:32px 32px 28px 32px;text-align:left;">
                <img src="${logoUrl}" alt="${safeSite}" width="200" style="display:block;height:auto;max-width:200px;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <p style="margin:0 0 6px 0;color:#64748b;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">Antwort auf Ihre Anfrage</p>
                <h1 style="margin:0 0 24px 0;color:#0e172a;font-size:22px;line-height:1.3;font-weight:700;">${safeSubject}</h1>
                <p style="margin:0 0 18px 0;color:#1f2a44;font-size:15px;line-height:1.6;">Hallo ${safeRecipient},</p>
                ${bodyHtml}
                <p style="margin:24px 0 4px 0;color:#1f2a44;font-size:15px;line-height:1.6;">Mit freundlichen Grüßen</p>
                <p style="margin:0;color:#0e172a;font-size:15px;line-height:1.6;font-weight:600;">${safeAuthor}</p>
                <p style="margin:0;color:#64748b;font-size:13px;">${safeSite}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <p style="margin:0 0 4px 0;color:#64748b;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;font-weight:600;">Fragen?</p>
                      <p style="margin:0;color:#1f2a44;font-size:14px;line-height:1.6;">
                        Antworten Sie einfach auf diese E-Mail – wir sind unter
                        <a href="mailto:${safeFrom}" style="color:#3861ce;text-decoration:none;">${safeFrom}</a>
                        ${safePhone ? ` oder telefonisch unter <a href="tel:${safePhone.replace(/\s+/g, "")}" style="color:#3861ce;text-decoration:none;">${safePhone}</a>` : ""}
                        für Sie erreichbar.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;">
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px 0;" />
                <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
                  ${safeSite} · <a href="${safeSiteUrl}" style="color:#64748b;text-decoration:none;">${safeSiteUrl.replace(/^https?:\/\//, "")}</a><br />
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
    `Fragen? E-Mail: ${input.fromEmail}` +
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
}

export interface SendResult {
  ok: boolean;
  via: "cloudflare" | "resend" | "none";
  messageId?: string;
  error?: string;
}

/**
 * Cloudflare-Email-Sending-Binding (`env.EMAIL` → `send_email` in wrangler.jsonc).
 * Setzt eine im Account onboardete Domain voraus (SPF/DKIM werden automatisch
 * durch das Dashboard-Onboarding gesetzt).
 */
export async function sendViaCloudflare(
  binding: SendEmail,
  input: SendInput,
): Promise<SendResult> {
  try {
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
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.fromName ? `${input.fromName} <${input.from}>` : input.from,
        to: [input.to],
        reply_to: input.replyTo ?? input.from,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
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
