import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { mailAttachments, prepareRichMail } from "../../../lib/compose-mail";
import {
  countMailboxes,
  createMailbox,
  findMailboxById,
  findMailboxByLocalPart,
  findUserById,
  getDb,
  getMailThread,
  insertMailMessage,
  latestInboundMailMessageId,
  setMailboxMembers,
  signatureNameForUser,
  upsertMailThread,
} from "../../../lib/db";
import {
  renderReplyEmailHtml,
  renderReplyEmailText,
  sendEmail,
} from "../../../lib/email";
import {
  canOpenMailbox,
  cleanLocalPart,
  cleanRecipient,
  mailboxAddress,
  MAX_MAILBOXES,
} from "../../../lib/mailbox";
import { DEFAULT_REPLY_DOMAIN, formatMessageIdHeader, normalizeMessageId } from "../../../lib/reply-address";

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
    return new Response(JSON.stringify({ ok: false, error: "D1 nicht verbunden." }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const form = await ctx.request.formData();
  const action = String(form.get("action") ?? "send");
  const redirectBase = safeRedirect(String(form.get("redirect") ?? ""), "/admin/postfach");

  if (action === "create") {
    const localPart = cleanLocalPart(String(form.get("local_part") ?? ""));
    const displayName = String(form.get("display_name") ?? "").trim().slice(0, 80);
    if (!localPart) return ctx.redirect(`${redirectBase}?mail=bad_address`, 303);
    if ((await countMailboxes(db)) >= MAX_MAILBOXES) {
      return ctx.redirect(`${redirectBase}?mail=full`, 303);
    }
    if (await findMailboxByLocalPart(db, localPart)) {
      return ctx.redirect(`${redirectBase}?mail=exists`, 303);
    }
    const memberIds = await membersFromForm(db, session.role, session.userId, form);
    if (memberIds === "invalid") return ctx.redirect(`${redirectBase}?mail=bad_user`, 303);
    const id = await createMailbox(db, localPart, displayName || localPart, memberIds);
    return ctx.redirect(`/admin/postfach/${id}?mail=created`, 303);
  }

  if (action === "assign") {
    if (session.role !== "admin") return ctx.redirect(`${redirectBase}?mail=forbidden`, 303);
    const mailboxId = Number.parseInt(String(form.get("mailbox_id") ?? ""), 10);
    const mailbox = Number.isFinite(mailboxId) ? await findMailboxById(db, mailboxId) : null;
    if (!mailbox) return ctx.redirect(`${redirectBase}?mail=not_found`, 303);
    const memberIds = await membersFromForm(db, "admin", session.userId, form);
    if (memberIds === "invalid") return ctx.redirect(`${redirectBase}?mail=bad_user`, 303);
    await setMailboxMembers(db, mailbox.id, memberIds);
    return ctx.redirect(`${redirectBase}?mail=assigned`, 303);
  }

  const domain = env?.REPLY_DOMAIN || DEFAULT_REPLY_DOMAIN;
  const threadIdRaw = Number.parseInt(String(form.get("thread_id") ?? ""), 10);
  const thread = Number.isFinite(threadIdRaw) && threadIdRaw > 0
    ? await getMailThread(db, threadIdRaw)
    : null;
  if (String(form.get("thread_id") ?? "") && !thread) {
    return ctx.redirect(`${redirectBase}?mail=not_found`, 303);
  }

  const mailbox = thread
    ? await findMailboxById(db, thread.mailbox_id)
    : await findMailboxById(db, Number.parseInt(String(form.get("mailbox_id") ?? ""), 10));
  if (!mailbox) return ctx.redirect(`${redirectBase}?mail=bad_from`, 303);
  if (!canOpenMailbox(session, mailbox)) {
    return ctx.redirect("/admin/postfach?mail=forbidden", 303);
  }

  const recipient = thread ? thread.peer_email : cleanRecipient(String(form.get("to") ?? ""));
  if (!recipient) return ctx.redirect(`${redirectBase}?mail=bad_to`, 303);

  const prepared = await prepareRichMail(form);
  if (!prepared.ok) return ctx.redirect(`${redirectBase}?mail=${prepared.code}`, 303);
  const { subject, emailBodyHtml, storedBodyHtml, plainBody, uploads } = prepared.mail;

  const authorName = await signatureNameForUser(db, session.userId, session.username);
  const fromEmail = mailboxAddress(mailbox.local_part, domain);
  const fromName = mailbox.display_name || env?.SITE_NAME || "Zeus-Service";
  const siteName = env?.SITE_NAME ?? "Zeus-Service";
  const siteUrl = env?.SITE_URL ?? "https://zeus-service.de";
  const typedName = String(form.get("recipient_name") ?? "").trim().slice(0, 120);
  const peerName = thread?.peer_name || typedName;

  const threadId = thread
    ? thread.id
    : await upsertMailThread(db, {
        mailboxId: mailbox.id,
        peerEmail: recipient,
        peerName,
        subject,
      });
  if (!threadId) return ctx.redirect(`${redirectBase}?mail=db_error`, 303);

  const priorMessageId = formatMessageIdHeader(await latestInboundMailMessageId(db, threadId));
  const headers = priorMessageId
    ? { "In-Reply-To": priorMessageId, References: priorMessageId }
    : undefined;

  let emailSentAt: number | null = null;
  let emailStatus: string | null = null;
  let emailError: string | null = null;
  let sentMessageId: string | null = null;

  if (env) {
    const result = await sendEmail(env, {
      from: fromEmail,
      fromName,
      to: recipient,
      replyTo: fromEmail,
      subject,
      html: renderReplyEmailHtml({
        siteName,
        siteUrl,
        recipientName: peerName,
        subject,
        bodyText: plainBody,
        bodyHtml: emailBodyHtml,
        authorName,
        fromEmail,
        replyToEmail: fromEmail,
        eyebrow: "Nachricht",
        greeting: peerName ? `Hallo ${peerName},` : null,
        footerNote: "Sie können direkt auf diese E-Mail antworten.",
      }),
      text: renderReplyEmailText({
        siteName,
        siteUrl,
        recipientName: peerName,
        subject,
        bodyText: plainBody,
        bodyHtml: emailBodyHtml,
        authorName,
        fromEmail,
        replyToEmail: fromEmail,
        greeting: peerName ? `Hallo ${peerName},` : null,
        footerNote: "Sie können direkt auf diese E-Mail antworten.",
      }),
      headers,
      attachments: mailAttachments(uploads),
    });
    if (result.ok) {
      emailSentAt = Math.floor(Date.now() / 1000);
      sentMessageId = normalizeMessageId(result.messageId);
      emailStatus = result.messageId ? `sent:${result.via}:${result.messageId}` : `sent:${result.via}`;
    } else if (result.via === "none") {
      emailStatus = "skipped:no_transport";
    } else {
      emailStatus = `failed:${result.via}`;
      emailError = result.error ?? "unbekannter Fehler";
      console.error("mailbox_send_failed", result.via, emailError);
    }
  } else {
    emailStatus = "skipped:no_env";
  }

  try {
    await insertMailMessage(db, {
      thread_id: threadId,
      direction: "outbound",
      from_email: fromEmail,
      to_email: recipient,
      subject,
      body: storedBodyHtml || plainBody,
      message_id: sentMessageId,
      email_sent_at: emailSentAt,
      email_status: emailStatus,
      email_error: emailError,
      user_id: session.userId ?? null,
      author_name: authorName,
    });
  } catch (err) {
    console.error("mailbox_persist_failed", err);
    return ctx.redirect(`${redirectBase}?mail=db_error`, 303);
  }

  const flag =
    emailStatus?.startsWith("sent:")
      ? "sent"
      : emailStatus?.startsWith("skipped")
        ? "saved_no_email"
        : "saved_email_failed";
  return ctx.redirect(`/admin/postfach/${mailbox.id}?offen=${threadId}&mail=${flag}`, 303);
}

async function membersFromForm(
  db: D1Database,
  role: string | undefined,
  sessionUserId: number | undefined,
  form: FormData,
): Promise<number[] | "invalid"> {
  if (role !== "admin") return sessionUserId ? [sessionUserId] : [];
  const rawIds = [...form.getAll("user_ids"), ...form.getAll("user_id")]
    .map((value) => String(value).trim())
    .filter(Boolean);
  const ids: number[] = [];
  for (const raw of rawIds) {
    const id = Number.parseInt(raw, 10);
    if (!Number.isFinite(id) || id <= 0) return "invalid";
    if (ids.includes(id)) continue;
    const person = await findUserById(db, id);
    if (!person) return "invalid";
    ids.push(person.id);
    if (ids.length > 30) return "invalid";
  }
  return ids;
}
