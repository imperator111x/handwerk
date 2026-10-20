import { cfEnv } from "../../../lib/cf";
import type { APIContext } from "astro";
import {
  formatSlot,
  getBookingForRequest,
  getOrCreateInvite,
  listOpenSlots,
  markInviteSent,
} from "../../../lib/appointments";
import { requireSession } from "../../../lib/auth";
import {
  getContactRequest,
  getDb,
  insertReply,
  signatureNameForUser,
  updateContactStatus,
} from "../../../lib/db";
import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "../../../lib/email";
import { buildReplyAddress, DEFAULT_REPLY_DOMAIN, normalizeMessageId } from "../../../lib/reply-address";

export const prerender = false;

function safeRedirect(target: string | null, fallback: string): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;

  const db = getDb(ctx);
  const form = await ctx.request.formData();
  const requestId = Number.parseInt(String(form.get("request_id") ?? ""), 10);
  const redirectTo = safeRedirect(
    String(form.get("redirect") ?? ""),
    `/admin/anfragen/${requestId}`,
  );
  if (!db || !Number.isFinite(requestId) || requestId <= 0) {
    return ctx.redirect(`${redirectTo}?termin=bad`, 303);
  }

  const request = await getContactRequest(db, requestId);
  if (!request) return ctx.redirect(`${redirectTo}?termin=missing`, 303);

  const booking = await getBookingForRequest(db, requestId);
  if (booking) return ctx.redirect(`${redirectTo}?termin=booked`, 303);

  const openSlots = await listOpenSlots(db);
  if (openSlots.length === 0) return ctx.redirect(`${redirectTo}?termin=no_slots`, 303);

  const env = cfEnv();
  const invite = await getOrCreateInvite(db, requestId);
  const siteUrl = (env?.SITE_URL ?? "https://zeus-service.de").replace(/\/$/, "");
  const link = `${siteUrl}/termin/${invite.token}`;
  const siteName = env?.SITE_NAME ?? "Zeus-Service";
  const fromEmail = env?.CONTACT_FROM_EMAIL ?? "website@zeus-service.de";
  const subject = `Termin vereinbaren – ${siteName}`;
  const preview = openSlots
    .slice(0, 5)
    .map((slot) => `• ${formatSlot(slot.starts_at, slot.ends_at)}`)
    .join("\n");
  const body = [
    "bitte wählen Sie einen passenden Termin für Ihren Einsatz.",
    "Über den Link tragen Sie Vorname, Nachname und Straße ein. Die Buchung wird Ihrer Anfrage zugeordnet. Denselben Link können Sie später zum Stornieren nutzen.",
    "",
    "Aktuell frei:",
    preview,
  ].join("\n");

  const replyDomain = env?.REPLY_DOMAIN || DEFAULT_REPLY_DOMAIN;
  const replyTo =
    env?.SESSION_SECRET
      ? await buildReplyAddress(env.SESSION_SECRET, requestId, replyDomain)
      : null;

  const authorName = await signatureNameForUser(db, session.userId, session.username);

  let emailStatus = "skipped:no_env";
  let sentMessageId: string | null = null;
  let emailSentAt: number | null = null;
  if (env) {
    const result = await sendEmail(env, {
      from: fromEmail,
      fromName: siteName,
      to: request.email,
      toName: request.name,
      replyTo: replyTo ?? fromEmail,
      subject,
      html: renderReplyEmailHtml({
        siteName,
        siteUrl,
        recipientName: request.name,
        subject,
        bodyText: body,
        authorName,
        fromEmail,
        phone: request.phone,
        replyToEmail: replyTo ?? fromEmail,
        ctaUrl: link,
        ctaLabel: "Termin auswählen",
      }),
      text: renderReplyEmailText({
        siteName,
        siteUrl,
        recipientName: request.name,
        subject,
        bodyText: body,
        authorName,
        fromEmail,
        phone: request.phone,
        replyToEmail: replyTo ?? fromEmail,
        ctaUrl: link,
        ctaLabel: "Termin auswählen",
      }),
    });
    if (result.ok) {
      emailSentAt = Math.floor(Date.now() / 1000);
      sentMessageId = normalizeMessageId(result.messageId);
      emailStatus = result.messageId ? `sent:${result.via}:${result.messageId}` : `sent:${result.via}`;
    } else if (result.via === "none") {
      emailStatus = "skipped:no_transport";
    } else {
      emailStatus = `failed:${result.via}`;
      console.error("appointment_mail_failed", result.error);
    }
  }

  await markInviteSent(db, invite.id, emailStatus);
  await insertReply(db, {
    request_id: requestId,
    user_id: session.userId ?? null,
    author_name: authorName,
    subject,
    body: `${body}\n\n${link}`,
    email_sent_at: emailSentAt,
    email_status: emailStatus,
    direction: "outbound",
    from_email: fromEmail,
    message_id: sentMessageId,
  });
  if (request.status === "new") {
    await updateContactStatus(db, requestId, "in_progress");
  }

  const flag = emailStatus.startsWith("sent:")
    ? "sent"
    : emailStatus.startsWith("skipped")
      ? "saved"
      : "failed";
  return ctx.redirect(`${redirectTo}?termin=${flag}`, 303);
}
