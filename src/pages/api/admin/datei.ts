import type { APIContext } from "astro";
import { requireSession, type SessionData } from "../../../lib/auth";
import { cfEnv } from "../../../lib/cf";
import { findMailboxById, getDb } from "../../../lib/db";
import {
  canOpenScan,
  getMailFile,
  isPreviewImage,
  mailboxIdForMessage,
  safeContentType,
  safeDownloadName,
  scanStoredFiles,
  type MailFileRow,
} from "../../../lib/mail-files";
import { canOpenMailbox } from "../../../lib/mailbox";

export const prerender = false;

function safeRedirect(target: string | null, fallback: string): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) return fallback;
  return target;
}

function lockedMessage(status: string): string {
  if (status === "malicious") return "VirusTotal hat diese Datei als schädlich eingestuft. Sie kann nicht geöffnet werden.";
  if (status === "error") return "Die Prüfung ist fehlgeschlagen. Die Datei bleibt gesperrt.";
  return "Die Datei wird noch geprüft und kann noch nicht geöffnet werden.";
}

async function mayRead(db: D1Database, session: SessionData, file: MailFileRow): Promise<boolean> {
  if (file.mail_message_id) {
    const mailboxId = await mailboxIdForMessage(db, file.mail_message_id);
    if (!mailboxId) return false;
    const mailbox = await findMailboxById(db, mailboxId);
    return mailbox != null && canOpenMailbox(session, mailbox);
  }
  return file.request_id != null || file.reply_id != null;
}

function contentDisposition(inline: boolean, filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const kind = inline ? "inline" : "attachment";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const db = getDb(ctx);
  const files = cfEnv()?.FILES;
  const id = Number.parseInt(ctx.url.searchParams.get("id") ?? "", 10);
  if (!db || !files || !Number.isInteger(id) || id <= 0) {
    return new Response("Diese Datei gibt es nicht.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const file = await getMailFile(db, id);
  if (!file || !(await mayRead(db, sessionOrRedirect, file))) {
    return new Response("Diese Datei gibt es nicht.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (!canOpenScan(file.scan_status)) {
    return new Response(lockedMessage(file.scan_status), {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff", "cache-control": "private, no-store" },
    });
  }
  const bytes = await files.get(file.storage_key, "arrayBuffer");
  if (!bytes) {
    return new Response("Die Datei ist nicht mehr verfügbar.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const type = safeContentType(file.content_type);
  const inline = isPreviewImage(type);
  const active = /^(?:text\/html|image\/svg\+xml|application\/xhtml\+xml|text\/xml|application\/(?:xml|javascript)|text\/javascript)$/.test(type);
  return new Response(bytes, {
    headers: {
      "content-type": inline ? type : active ? "application/octet-stream" : type,
      "content-disposition": contentDisposition(inline, safeDownloadName(file.filename)),
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const env = cfEnv();
  const db = env?.DB;
  const form = await ctx.request.formData();
  const redirectTo = safeRedirect(String(form.get("redirect") ?? ""), "/admin");
  if (!db) return ctx.redirect(redirectTo, 303);
  const id = Number.parseInt(String(form.get("id") ?? ""), 10);
  if (!Number.isInteger(id) || id <= 0) return ctx.redirect(redirectTo, 303);
  const file = await getMailFile(db, id);
  if (!file || !(await mayRead(db, sessionOrRedirect, file))) return ctx.redirect(redirectTo, 303);
  await scanStoredFiles(
    env,
    [{ id: file.id, sha256: file.sha256, filename: file.filename, analysisId: file.vt_analysis_id }],
    { poll: true },
  );
  return ctx.redirect(redirectTo, 303);
}
