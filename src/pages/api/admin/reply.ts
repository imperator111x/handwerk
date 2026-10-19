import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import {
  getContactRequest,
  getDb,
  insertReply,
  updateContactStatus,
} from "../../../lib/db";
import {
  renderReplyEmailHtml,
  renderReplyEmailText,
  sendViaResend,
} from "../../../lib/email";

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

  if (env?.RESEND_API_KEY) {
    const authorName = session.username;
    const siteName = env.SITE_NAME ?? "Zeus-Service";
    const siteUrl = env.SITE_URL ?? "https://zeus-service.de";
    const fromEmail = env.CONTACT_FROM_EMAIL ?? "website@zeus-service.de";

    const emailInput = {
      siteName,
      siteUrl,
      recipientName: request.name,
      subject,
      bodyText: body,
      authorName,
      fromEmail,
      phone: request.phone ?? null,
    };

    const result = await sendViaResend({
      apiKey: env.RESEND_API_KEY,
      from: `${siteName} <${fromEmail}>`,
      to: request.email,
      replyTo: fromEmail,
      subject,
      html: renderReplyEmailHtml(emailInput),
      text: renderReplyEmailText(emailInput),
    });

    if (result.ok) {
      emailSentAt = Math.floor(Date.now() / 1000);
      emailStatus = result.id ? `sent:${result.id}` : "sent";
    } else {
      emailStatus = `failed:${result.status}`;
      emailError = result.error ?? "unbekannter Fehler";
      console.error("resend_reply_failed", emailStatus, emailError);
    }
  } else {
    emailStatus = "skipped:no_resend_key";
  }

  try {
    await insertReply(db, {
      request_id: requestId,
      user_id: session.userId ?? null,
      author_name: session.username,
      subject,
      body,
      email_sent_at: emailSentAt,
      email_status: emailStatus,
      email_error: emailError,
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
