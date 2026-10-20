import { handle } from "@astrojs/cloudflare/handler";
import PostalMime from "postal-mime";
import { blockedKinds, normalizeBlockEmail } from "./lib/blocks";
import { ingestInboundEmail, type IngestResult } from "./lib/inbound-mail";
import { scanStoredFiles, storeInboundFiles, type RawAttachment } from "./lib/mail-files";
import { isExternalMailboxAddress } from "./lib/mailbox";
import { mailNotice, replyNotice, requestNotice } from "./lib/notice-copy";
import { notifyStaff } from "./lib/notify";

interface InboundMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<unknown>;
}

const MAX_INBOUND_BYTES = 20_000_000;

function mailboxAddress(address: { address?: string; group?: Array<{ address?: string }> }): string[] {
  if (address.address) return [address.address];
  return (address.group ?? []).flatMap((member) => (member.address ? [member.address] : []));
}

async function emailIsBlocked(db: D1Database, email: string | null): Promise<boolean> {
  if (!email) return false;
  try {
    return (await blockedKinds(db, { email })).email;
  } catch (err) {
    console.error("inbound_block_check_failed", err);
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === "www.zeus-service.de") {
      url.hostname = "zeus-service.de";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === "/admin-sw.js") {
      const asset = await env.ASSETS.fetch(new Request(new URL("/admin-sw.js", url.origin)));
      const headers = new Headers(asset.headers);
      headers.set("content-type", "application/javascript; charset=utf-8");
      headers.set("cache-control", "no-cache");
      return new Response(asset.body, { status: asset.status, headers });
    }
    const response = await handle(request, env, ctx);
    return response ?? new Response(null, { status: 500 });
  },
  async email(message: InboundMessage, env: Env, ctx: ExecutionContext) {
    await receiveEmail(message, env, ctx);
  },
} satisfies ExportedHandler<Env>;

async function receiveEmail(message: InboundMessage, env: Env, ctx: ExecutionContext): Promise<void> {
  const domain = env.REPLY_DOMAIN || "zeus-service.de";
  if (isExternalMailboxAddress(message.to, domain)) {
    const target = env.INFO_FORWARD_TO?.trim();
    if (!target) {
      message.setReject("info@ ist gerade nicht erreichbar.");
      return;
    }
    try {
      await message.forward(target);
      console.log("info_forwarded");
    } catch (err) {
      console.error("info_forward_failed", err);
      message.setReject("info@ ist gerade nicht erreichbar.");
    }
    return;
  }
  if (!env.DB) {
    message.setReject("Postfach vorübergehend nicht erreichbar.");
    return;
  }
  const envelopeFrom = normalizeBlockEmail(message.from);
  if (await emailIsBlocked(env.DB, envelopeFrom)) {
    console.log("inbound_blocked");
    return;
  }
  if (message.rawSize > MAX_INBOUND_BYTES) {
    console.log("inbound_too_large", message.rawSize);
    message.setReject("Die Nachricht ist zu groß.");
    return;
  }

  let parsed;
  try {
    const raw = await new Response(message.raw).arrayBuffer();
    parsed = await PostalMime.parse(raw);
  } catch (err) {
    console.error("inbound_parse_failed", err);
    message.setReject("Nachricht konnte nicht gelesen werden.");
    return;
  }

  const fromMailbox = parsed.from && "address" in parsed.from ? parsed.from : null;
  const headerFrom = normalizeBlockEmail(fromMailbox && "address" in fromMailbox ? fromMailbox.address ?? "" : "");
  if (headerFrom && headerFrom !== envelopeFrom && (await emailIsBlocked(env.DB, headerFrom))) {
    console.log("inbound_blocked");
    return;
  }
  const headerRecipients = [
    message.headers.get("delivered-to"),
    message.headers.get("x-original-to"),
    message.headers.get("to"),
    message.headers.get("cc"),
    parsed.deliveredTo,
    ...(parsed.to ?? []).flatMap(mailboxAddress),
    ...(parsed.cc ?? []).flatMap(mailboxAddress),
  ];

  const fromLabel = fromMailbox?.name || message.from;
  const subject = (parsed.subject ?? message.headers.get("subject") ?? "Ohne Betreff").slice(0, 120);
  const result = await ingestInboundEmail(env.DB, env.SESSION_SECRET ?? "", {
    envelopeFrom: message.from,
    recipients: [message.to, ...headerRecipients],
    subject: parsed.subject ?? message.headers.get("subject"),
    messageId: parsed.messageId ?? message.headers.get("message-id"),
    inReplyTo: parsed.inReplyTo ?? message.headers.get("in-reply-to"),
    references: parsed.references ?? message.headers.get("references"),
    text: parsed.text ?? null,
    html: typeof parsed.html === "string" ? parsed.html : null,
    fromName: fromMailbox?.name || null,
    autoSubmitted: message.headers.get("auto-submitted"),
  }, domain);

  if (result.action === "reject") {
    message.setReject(result.reason);
    return;
  }
  const detail =
    "threadId" in result ? result.threadId : "requestId" in result ? result.requestId : result.reason;
  console.log("inbound_email", result.action, detail);
  await keepInboundAttachments(env, ctx, parsed.attachments ?? [], result);
  if (result.action === "mailbox") {
    await notifyStaff(env, { ...mailNotice(fromLabel, subject), url: "/admin/postfach" });
  } else if (result.action === "created") {
    await notifyStaff(env, {
      ...requestNotice(fromLabel, subject || "E-Mail"),
      url: `/admin/anfragen/${result.requestId}`,
    });
  } else if (result.action === "stored") {
    await notifyStaff(env, {
      ...replyNotice(fromLabel, subject),
      url: `/admin/anfragen/${result.requestId}`,
    });
  }
}

async function keepInboundAttachments(
  env: Env,
  ctx: ExecutionContext,
  attachments: RawAttachment[],
  result: IngestResult,
): Promise<void> {
  if (!env.DB || !env.FILES || attachments.length === 0) return;
  const link =
    result.action === "mailbox"
      ? { mailMessageId: result.messageRowId }
      : result.action === "stored"
        ? { replyId: result.replyId, requestId: result.requestId }
        : result.action === "created"
          ? { requestId: result.requestId }
          : null;
  if (!link) return;
  try {
    const stored = await storeInboundFiles(env.DB, env.FILES, link, attachments);
    if (stored.length === 0) return;
    ctx.waitUntil(
      scanStoredFiles(env, stored, { poll: true }).catch((err: unknown) => {
        console.error("virus_total_failed", err instanceof Error ? err.name : "error");
      }),
    );
  } catch (err) {
    console.error("mail_files_failed", err instanceof Error ? err.name : "error");
  }
}
