import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import {
  getContactRequest,
  getDb,
  insertReply,
  latestInboundMessageId,
  signatureNameForUser,
  updateContactStatus,
} from "../../../lib/db";
import {
  renderReplyEmailHtml,
  renderReplyEmailText,
  sendEmail,
} from "../../../lib/email";
import {
  buildReplyAddress,
  DEFAULT_REPLY_DOMAIN,
  formatMessageIdHeader,
  normalizeMessageId,
} from "../../../lib/reply-address";

export const prerender = false;

function safeRedirect(target: string | null, fallback: string): string {
  if (!target) return fallback;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;

  const env = ctx.locals.runtime?.env;
  const db = getDb(ctx);
  if (!db) {
    return new Response(
      JSON.stringify({ ok: false, error: "D1 nicht verbunden." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const form = await ctx.request.formData();
  const requestId = Number.parseInt(String(form.get("request_id") ?? ""), 10);
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const alsoMarkDone = form.get("mark_done") === "on";
  const redirectBase = safeRedirect(
    String(form.get("redirect") ?? ""),
    `/admin/anfragen/${requestId}`,
  );

  if (!Number.isFinite(requestId) || requestId <= 0) {
    return ctx.redirect(`${redirectBase}?reply=bad_id`, 303);
  }
  if (subject.length < 3 || subject.length > 200) {
    return ctx.redirect(`${redirectBase}?reply=bad_subject`, 303);
  }
  if (body.length < 5 || body.length > 10_000) {
    return ctx.redirect(`${redirectBase}?reply=bad_body`, 303);
  }

  const request = await getContactRequest(db, requestId);
  if (!request) {
    return ctx.redirect(`${redirectBase}?reply=not_found`, 303);
  }

  let emailSentAt: number | null = null;
  let emailStatus: string | null = null;
  let emailError: string | null = null;
  let sentMessageId: string | null = null;

  const authorName = await signatureNameForUser(
    db,
    session.userId,
    session.username,
  );
  const siteName = env?.SITE_NAME ?? "Zeus-Service";
  const siteUrl = env?.SITE_URL ?? "https://zeus-service.de";
  const fromEmail = env?.CONTACT_FROM_EMAIL ?? "website@zeus-service.de";

  const replyDomain = env?.REPLY_DOMAIN || DEFAULT_REPLY_DOMAIN;
  const replyAddress =
    env?.SESSION_SECRET
      ? await buildReplyAddress(env.SESSION_SECRET, requestId, replyDomain)
      : null;
  const replyTo = replyAddress ?? fromEmail;
  const priorMessageId = formatMessageIdHeader(
    await latestInboundMessageId(db, requestId),
  );
  const headers = priorMessageId
    ? {
        "In-Reply-To": priorMessageId,
        References: priorMessageId,
      }
    : undefined;

  const emailInput = {
    siteName,
    siteUrl,
    recipientName: request.name,
    subject,
    bodyText: body,
    authorName,
    fromEmail,
    phone: request.phone ?? null,
    replyToEmail: replyTo,
  };

  if (env) {
    const result = await sendEmail(env, {
      from: fromEmail,
      fromName: siteName,
      to: request.email,
      toName: request.name,
      replyTo,
      subject,
      html: renderReplyEmailHtml(emailInput),
      text: renderReplyEmailText(emailInput),
      headers,
    });

    if (result.ok) {
      emailSentAt = Math.floor(Date.now() / 1000);
      sentMessageId = normalizeMessageId(result.messageId);
      emailStatus = result.messageId
        ? `sent:${result.via}:${result.messageId}`
        : `sent:${result.via}`;
    } else if (result.via === "none") {
      emailStatus = "skipped:no_transport";
    } else {
      emailStatus = `failed:${result.via}`;
      emailError = result.error ?? "unbekannter Fehler";
      console.error("reply_send_failed", result.via, emailError);
    }
  } else {
    emailStatus = "skipped:no_env";
  }

  try {
    await insertReply(db, {
      request_id: requestId,
      user_id: session.userId ?? null,
      author_name: authorName,
      subject,
      body,
      email_sent_at: emailSentAt,
      email_status: emailStatus,
      email_error: emailError,
      direction: "outbound",
      from_email: fromEmail,
      message_id: sentMessageId,
    });
  } catch (err) {
    console.error("reply_persist_failed", err);
    return ctx.redirect(`${redirectBase}?reply=db_error`, 303);
  }

  if (alsoMarkDone) {
    await updateContactStatus(db, requestId, "done").catch((err) => {
      console.error("mark_done_failed", err);
    });
  } else if (request.status === "new") {
    await updateContactStatus(db, requestId, "in_progress").catch((err) => {
      console.error("mark_in_progress_failed", err);
    });
  }

  const flag =
    emailStatus === null || emailStatus === "sent" || emailStatus?.startsWith("sent:")
      ? "sent"
      : emailStatus.startsWith("skipped")
        ? "saved_no_email"
        : "saved_email_failed";

  return ctx.redirect(`${redirectBase}?reply=${flag}`, 303);
}
