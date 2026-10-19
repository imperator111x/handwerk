/**
 * Ordnet eine eingehende Kundenmail einer Anfrage zu und speichert sie
 * im Verlauf. Die Zuordnung läuft über die signierte Antwortadresse
 * und, falls die fehlt, über In-Reply-To / References.
 * Danach zählt die Absenderadresse der letzten Anfrage.
 * Mails ohne Zuordnung werden als neue Anfrage angelegt, damit das
 * Postfach nach dem Wechsel von Lima-City nicht ins Leere läuft.
 */

import {
  findLatestRequestIdBySender,
  findMailboxByLocalPart,
  findMailMessageByMessageId,
  findMailThreadIdByMessageIds,
  findRequestIdByMessageIds,
  getContactRequest,
  getMailThread,
  insertContactRequest,
  insertInboundReply,
  insertMailMessage,
  updateContactStatus,
  upsertMailThread,
} from "./db";
import { MAIL_DOMAIN, matchMailboxLocalPart } from "./mailbox";
import {
  collectAddresses,
  extractMessageIds,
  normalizeMessageId,
  parseReplyToken,
  verifyReplyToken,
} from "./reply-address";

export interface ParsedInbound {
  envelopeFrom: string;
  recipients: Array<string | null | undefined>;
  subject?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  text?: string | null;
  html?: string | null;
  fromName?: string | null;
  autoSubmitted?: string | null;
}

export type IngestResult =
  | { action: "stored"; requestId: number; replyId: number }
  | { action: "created"; requestId: number }
  | { action: "duplicate"; requestId: number }
  | { action: "mailbox"; threadId: number; messageRowId: number }
  | { action: "mailbox_duplicate"; threadId: number }
  | { action: "ignore"; reason: string }
  | { action: "reject"; reason: string };

const MAX_BODY = 20_000;

export async function ingestInboundEmail(
  db: D1Database,
  secret: string,
  email: ParsedInbound,
  domain = MAIL_DOMAIN,
): Promise<IngestResult> {
  const from = email.envelopeFrom.trim().toLowerCase();
  if (!from || !from.includes("@")) {
    return { action: "reject", reason: "Absender fehlt." };
  }
  if (isAutomated(from, email.autoSubmitted ?? null, email.subject ?? "")) {
    return { action: "ignore", reason: "automatische Nachricht" };
  }

  let requestId = await resolveRequestId(db, secret, email);
  if (!requestId) {
    const mailboxResult = await storeMailboxMail(db, email, from, domain);
    if (mailboxResult) return mailboxResult;
    requestId = await findLatestRequestIdBySender(db, from);
  }
  if (!requestId) {
    const createdId = await insertContactRequest(db, {
      name: cleanName(email.fromName) || from.split("@")[0] || "Kunde",
      email: from,
      topic: "sonstiges",
      message:
        clip(extractCustomerText(email.text ?? "", email.html ?? "")) ||
        "(Keine Textnachricht)",
    });
    return { action: "created", requestId: createdId };
  }

  const request = await getContactRequest(db, requestId);
  if (!request) {
    return { action: "reject", reason: "Diese Adresse ist keiner Anfrage zugeordnet." };
  }

  const messageId = normalizeMessageId(email.messageId);
  const body = clip(extractCustomerText(email.text ?? "", email.html ?? ""));
  const author =
    cleanName(email.fromName) ||
    request.name ||
    from.split("@")[0] ||
    "Kunde";

  try {
    const inserted = await insertInboundReply(db, {
      request_id: requestId,
      author_name: author,
      from_email: from,
      subject: clip(email.subject?.trim() || `Antwort von ${author}`, 200),
      body: body || "(Keine Textnachricht)",
      message_id: messageId,
    });
    if (inserted.duplicate) {
      return { action: "duplicate", requestId };
    }
    if (request.status === "done" || request.status === "archived") {
      await updateContactStatus(db, requestId, "in_progress");
    }
    return { action: "stored", requestId, replyId: inserted.id };
  } catch (err) {
    console.error("inbound_persist_failed", err);
    return { action: "reject", reason: "Nachricht konnte gerade nicht gespeichert werden." };
  }
}

async function resolveRequestId(
  db: D1Database,
  secret: string,
  email: ParsedInbound,
): Promise<number | null> {
  for (const address of collectAddresses(email.recipients)) {
    const token = parseReplyToken(address);
    if (!token) continue;
    if (await verifyReplyToken(secret, token.requestId, token.signature)) {
      return token.requestId;
    }
  }

  const referenced = [
    ...extractMessageIds(email.inReplyTo),
    ...extractMessageIds(email.references),
  ];
  if (referenced.length > 0) {
    const threaded = await findRequestIdByMessageIds(db, referenced);
    if (threaded) return threaded;
  }

  return null;
}

async function storeMailboxMail(
  db: D1Database,
  email: ParsedInbound,
  from: string,
  domain: string,
): Promise<IngestResult | null> {
  const referenced = [
    ...extractMessageIds(email.inReplyTo),
    ...extractMessageIds(email.references),
  ];
  const linkedThreadId =
    referenced.length > 0 ? await findMailThreadIdByMessageIds(db, referenced) : null;
  const local = matchMailboxLocalPart(email.recipients, domain);
  const mailbox = local ? await findMailboxByLocalPart(db, local) : null;
  if (!linkedThreadId && !mailbox) return null;

  const linked = linkedThreadId ? await getMailThread(db, linkedThreadId) : null;
  const mailboxId = linked?.mailbox_id ?? mailbox?.id;
  if (!mailboxId) return null;

  const messageId = normalizeMessageId(email.messageId);
  if (messageId) {
    const existing = await findMailMessageByMessageId(db, messageId);
    if (existing) return { action: "mailbox_duplicate", threadId: existing.thread_id };
  }

  const peerName = cleanName(email.fromName);
  const subject = clip(email.subject?.trim() || "Nachricht", 200);
  const threadId = linked
    ? linked.id
    : await upsertMailThread(db, {
        mailboxId,
        peerEmail: from,
        peerName,
        subject,
      });
  if (!threadId) {
    return { action: "reject", reason: "Nachricht konnte gerade nicht gespeichert werden." };
  }

  const ownAddress = mailbox
    ? `${mailbox.local_part}@${domain.replace(/^@/, "")}`
    : linked
      ? `${linked.local_part}@${domain.replace(/^@/, "")}`
      : from;
  try {
    const id = await insertMailMessage(db, {
      thread_id: threadId,
      direction: "inbound",
      from_email: from,
      to_email: ownAddress,
      subject,
      body: clip(extractCustomerText(email.text ?? "", email.html ?? "")) || "(Keine Textnachricht)",
      message_id: messageId,
      email_status: "received",
      author_name: peerName || from.split("@")[0] || "Absender",
    });
    return { action: "mailbox", threadId, messageRowId: id };
  } catch (err) {
    console.error("mailbox_persist_failed", err);
    return { action: "reject", reason: "Nachricht konnte gerade nicht gespeichert werden." };
  }
}

function isAutomated(from: string, autoSubmitted: string | null, subject: string): boolean {
  const local = from.split("@")[0] ?? "";
  if (
    local === "mailer-daemon" ||
    local === "postmaster" ||
    local.startsWith("no-reply") ||
    local.startsWith("noreply")
  ) {
    return true;
  }
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;
  return /^auto(?:matic|matische)/i.test(subject.trim());
}

export function extractCustomerText(text: string, html: string): string {
  const source = text.trim() ? text : htmlToText(html);
  const normalized = source.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
  const lines = normalized.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (isQuoteBoundary(trimmed)) break;
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }
  const fresh = kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*Sent from my (?:iPhone|iPad)\s*$/i, "")
    .replace(/\s*Von meinem (?:iPhone|iPad) gesendet\s*$/i, "")
    .trim();
  return fresh || normalized.trim();
}

function isQuoteBoundary(line: string): boolean {
  return (
    /^On .+wrote:\s*$/i.test(line) ||
    /^Am .+schrieb.+:\s*$/i.test(line) ||
    /^-{2,}\s*(Original Message|Ursprüngliche Nachricht)\s*-{2,}$/i.test(line) ||
    /^_{5,}$/.test(line) ||
    /^Von:\s.+/i.test(line) && /@/.test(line)
  );
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cleanName(value: string | null | undefined): string {
  return (value ?? "").replace(/["<>]/g, "").trim().slice(0, 120);
}

function clip(value: string, max = MAX_BODY): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}
