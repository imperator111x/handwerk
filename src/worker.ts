import { App } from "astro/app";
import type { SSRManifest } from "astro";
import { handle } from "@astrojs/cloudflare/handler";
import PostalMime from "postal-mime";
import { ingestInboundEmail } from "./lib/inbound-mail";
import { notifyStaff } from "./lib/notify";

interface InboundMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
}

const MAX_INBOUND_BYTES = 2_000_000;

function mailboxAddress(address: { address?: string; group?: Array<{ address?: string }> }): string[] {
  if (address.address) return [address.address];
  return (address.group ?? []).flatMap((member) => (member.address ? [member.address] : []));
}

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);
  return {
    default: {
      async fetch(
        request: Parameters<typeof handle>[2],
        env: Env,
        ctx: Parameters<typeof handle>[4],
      ) {
        const url = new URL((request as unknown as Request).url);
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
        return handle(manifest, app, request, env, ctx);
      },
      async email(message: InboundMessage, env: Env) {
        await receiveEmail(message, env);
      },
    },
  };
}

async function receiveEmail(message: InboundMessage, env: Env): Promise<void> {
  if (!env.DB) {
    message.setReject("Postfach vorübergehend nicht erreichbar.");
    return;
  }
  if (message.rawSize > MAX_INBOUND_BYTES) {
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
  }, env.REPLY_DOMAIN || "zeus-service.de");

  if (result.action === "reject") {
    message.setReject(result.reason);
    return;
  }
  const detail =
    "threadId" in result ? result.threadId : "requestId" in result ? result.requestId : result.reason;
  console.log("inbound_email", result.action, detail);
  if (result.action === "mailbox") {
    await notifyStaff(env, {
      title: "Neue Mail",
      body: `${fromLabel}: ${subject}`,
      url: `/admin/postfach`,
    });
  } else if (result.action === "stored" || result.action === "created") {
    await notifyStaff(env, {
      title: result.action === "created" ? "Neue Anfrage" : "Kunde hat geantwortet",
      body: `${fromLabel}: ${subject}`,
      url: `/admin/anfragen/${result.requestId}`,
    });
  }
}
