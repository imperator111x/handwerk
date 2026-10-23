import { canOpenScan, inspectWithVirusTotal, type ScanOutcome, type ScanStatus } from "./virus-total";

// Cloudflare Email Sending begrenzt die ganze Nachricht auf 5 MiB.
// Base64 vergrößert Anhänge um ein Drittel, das Logo und der HTML-Rahmen
// brauchen ebenfalls Platz. 3 MB Rohdaten bleiben darunter.
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
export const MAX_FILES = 6;

export interface PreparedUpload {
  filename: string;
  type: string;
  bytes: Uint8Array;
  kind: "image" | "document";
  uploadId?: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "datei";
  const clean = base.replace(/[^\w.\- ()äöüÄÖÜß]+/g, "_").replace(/^\.+/, "").slice(0, 80);
  return clean || "datei";
}

function matchesMagic(type: string, extension: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (type === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
  if (type === "image/gif") return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
  if (type === "image/webp") {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length > 12 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (type === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  if (type === "text/plain") {
    return extension === "txt" && !bytes.slice(0, 1024).includes(0);
  }
  if (type === "application/msword" || type === "application/vnd.ms-excel") {
    return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]);
  }
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  }
  return false;
}

function typeFor(filename: string, declared: string): { type: string; kind: "image" | "document" } | null {
  const extension = extensionOf(filename);
  const byExtension: Record<string, { type: string; kind: "image" | "document" }> = {
    jpg: { type: "image/jpeg", kind: "image" },
    jpeg: { type: "image/jpeg", kind: "image" },
    png: { type: "image/png", kind: "image" },
    gif: { type: "image/gif", kind: "image" },
    webp: { type: "image/webp", kind: "image" },
    pdf: { type: "application/pdf", kind: "document" },
    doc: { type: "application/msword", kind: "document" },
    docx: {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "document",
    },
    xls: { type: "application/vnd.ms-excel", kind: "document" },
    xlsx: {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind: "document",
    },
    txt: { type: "text/plain", kind: "document" },
  };
  const fromName = byExtension[extension];
  if (!fromName) return null;
  const declaredType = declared.toLowerCase().split(";")[0].trim();
  if (declaredType && declaredType !== "application/octet-stream" && declaredType !== fromName.type) {
    return null;
  }
  if (fromName.kind === "image" && !IMAGE_TYPES.has(fromName.type)) return null;
  if (fromName.kind === "document" && !DOCUMENT_TYPES.has(fromName.type)) return null;
  return fromName;
}

export function inspectUpload(
  filename: string,
  declaredType: string,
  bytes: Uint8Array,
  uploadId?: string,
): PreparedUpload | null {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_FILE_BYTES) return null;
  const safeName = safeFilename(filename);
  const typed = typeFor(safeName, declaredType);
  if (!typed || !matchesMagic(typed.type, extensionOf(safeName), bytes)) return null;
  if (uploadId !== undefined && !/^[a-z0-9]{4,32}$/i.test(uploadId)) return null;
  return {
    filename: safeName,
    type: typed.type,
    bytes,
    kind: typed.kind,
    uploadId,
  };
}

/** Bilddateien heißen `{uploadId}--{dateiname}`. Getrennt wird am ersten `--`. */
export function imageNameParts(name: string): { uploadId: string; filename: string } | null {
  const sep = name.indexOf("--");
  if (sep < 4 || sep > 32) return null;
  const uploadId = name.slice(0, sep);
  const filename = name.slice(sep + 2);
  if (!/^[a-z0-9]{4,32}$/i.test(uploadId) || !filename) return null;
  return { uploadId, filename };
}

export async function readFormUploads(
  entries: FormDataEntryValue[],
  kind: "image" | "document",
): Promise<PreparedUpload[] | null> {
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const prepared: PreparedUpload[] = [];
  for (const file of files) {
    const named = kind === "image" ? imageNameParts(file.name) : null;
    if (kind === "image" && !named) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspected = inspectUpload(
      named?.filename ?? file.name,
      file.type,
      bytes,
      named?.uploadId,
    );
    if (!inspected || inspected.kind !== kind) return null;
    prepared.push(inspected);
  }
  return prepared;
}

/** Einfache Bild-Uploads ohne `{id}--name`-Konvention (Kundenportal). */
export async function readPlainImageUploads(
  entries: FormDataEntryValue[],
  options: { maxFiles?: number; maxTotalBytes?: number } = {},
): Promise<PreparedUpload[] | "too-many" | "too-large" | "bad"> {
  const maxFiles = options.maxFiles ?? MAX_FILES;
  const maxTotal = options.maxTotalBytes ?? MAX_TOTAL_BYTES;
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length > maxFiles) return "too-many";
  const prepared: PreparedUpload[] = [];
  let total = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    total += bytes.byteLength;
    if (total > maxTotal) return "too-large";
    const inspected = inspectUpload(file.name, file.type, bytes);
    if (!inspected || inspected.kind !== "image") return "bad";
    prepared.push(inspected);
  }
  return prepared;
}

export function uploadsAsAttachments(uploads: PreparedUpload[]): RawAttachment[] {
  return uploads.map((upload) => ({
    filename: upload.filename,
    mimeType: upload.type,
    content: upload.bytes,
  }));
}

const INBOUND_MAX_FILES = 12;
const INBOUND_MAX_BYTES = 15_000_000;

export interface MailFileRow {
  id: number;
  mail_message_id: number | null;
  reply_id: number | null;
  request_id: number | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  storage_key: string;
  scan_status: ScanStatus | string;
  vt_malicious: number;
  vt_suspicious: number;
  vt_harmless: number;
  vt_analysis_id: string | null;
  created_at: number;
}

export interface RawAttachment {
  filename?: string | null;
  mimeType?: string | null;
  contentId?: string | null;
  content: ArrayBuffer | Uint8Array | string;
  encoding?: "base64" | "utf8" | null;
}

export interface FileLink {
  mailMessageId?: number | null;
  replyId?: number | null;
  requestId?: number | null;
}

export function safeDownloadName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "anhang";
  const clean = base.replace(/[^\w.\- ()äöüÄÖÜß]+/g, "_").replace(/^\.+/, "").slice(0, 120);
  return clean || "anhang";
}

export function safeContentType(value: string): string {
  const type = value.split(";")[0]?.trim().toLowerCase() ?? "";
  return /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : "application/octet-stream";
}

export function isPreviewImage(contentType: string): boolean {
  return IMAGE_TYPES.has(safeContentType(contentType));
}

export function attachmentBytes(file: RawAttachment): Uint8Array | null {
  const { content, encoding } = file;
  if (typeof content === "string") {
    if (encoding === "base64") {
      const clean = content.replace(/\s/g, "");
      if (!clean || clean.length % 4 === 1) return null;
      try {
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
      } catch {
        return null;
      }
    }
    return new TextEncoder().encode(content);
  }
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

export async function storeInboundFiles(
  db: D1Database,
  bucket: KVNamespace,
  link: FileLink,
  attachments: RawAttachment[],
): Promise<Array<{ id: number; bytes: Uint8Array; sha256: string; filename: string }>> {
  const stored: Array<{ id: number; bytes: Uint8Array; sha256: string; filename: string }> = [];
  let kept = 0;
  for (const attachment of attachments) {
    if (kept >= INBOUND_MAX_FILES) break;
    const bytes = attachmentBytes(attachment);
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > INBOUND_MAX_BYTES) continue;
    const filename = safeDownloadName(attachment.filename?.trim() || "anhang");
    const contentType = safeContentType(attachment.mimeType || "application/octet-stream");
    const owned = bytes.slice();
    const sha256 = await sha256Hex(owned);
    const storageKey = `file:${crypto.randomUUID()}`;
    await bucket.put(storageKey, owned);
    const result = await db
      .prepare(
        `INSERT INTO mail_files
           (mail_message_id, reply_id, request_id, filename, content_type, size_bytes, sha256, storage_key, scan_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      )
      .bind(
        link.mailMessageId ?? null,
        link.replyId ?? null,
        link.requestId ?? null,
        filename,
        contentType,
        owned.byteLength,
        sha256,
        storageKey,
      )
      .run();
    const id = Number(result.meta.last_row_id ?? 0);
    if (!Number.isInteger(id) || id <= 0) continue;
    kept += 1;
    stored.push({ id, bytes: owned, sha256, filename });
  }
  return stored;
}

export async function listMailFiles(db: D1Database, where: string, values: number[]): Promise<MailFileRow[]> {
  if (values.length === 0) return [];
  const { results } = await db
    .prepare(`SELECT * FROM mail_files WHERE ${where} ORDER BY id ASC`)
    .bind(...values)
    .all<MailFileRow>();
  return results ?? [];
}

export async function listFilesForMessages(db: D1Database, messageIds: number[]): Promise<MailFileRow[]> {
  const ids = messageIds.filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return [];
  return listMailFiles(db, `mail_message_id IN (${ids.map(() => "?").join(", ")})`, ids);
}

export async function listFilesForRequest(db: D1Database, requestId: number, replyIds: number[]): Promise<MailFileRow[]> {
  const replies = replyIds.filter((id) => Number.isInteger(id) && id > 0);
  const placeholders = replies.map(() => "?").join(", ");
  const where = replies.length ? `request_id = ? OR reply_id IN (${placeholders})` : "request_id = ?";
  return listMailFiles(db, where, [requestId, ...replies]);
}

export async function listFilesForRequests(db: D1Database, requestIds: number[]): Promise<MailFileRow[]> {
  const ids = requestIds.filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return [];
  return listMailFiles(db, `request_id IN (${ids.map(() => "?").join(", ")})`, ids);
}

export async function getMailFile(db: D1Database, id: number): Promise<MailFileRow | null> {
  return db.prepare(`SELECT * FROM mail_files WHERE id = ? LIMIT 1`).bind(id).first<MailFileRow>();
}

async function saveOutcome(db: D1Database, id: number, outcome: ScanOutcome): Promise<void> {
  await db
    .prepare(
      `UPDATE mail_files
          SET scan_status = ?, vt_malicious = ?, vt_suspicious = ?, vt_harmless = ?,
              vt_analysis_id = COALESCE(?, vt_analysis_id)
        WHERE id = ?`,
    )
    .bind(outcome.status, outcome.malicious, outcome.suspicious, outcome.harmless, outcome.analysisId, id)
    .run();
}

async function priorVerdict(db: D1Database, sha256: string): Promise<ScanOutcome | null> {
  const row = await db
    .prepare(
      `SELECT scan_status, vt_malicious, vt_suspicious, vt_harmless
         FROM mail_files
        WHERE sha256 = ? AND scan_status IN ('clean', 'malicious')
        LIMIT 1`,
    )
    .bind(sha256)
    .first<{ scan_status: string; vt_malicious: number; vt_suspicious: number; vt_harmless: number }>();
  if (!row) return null;
  return {
    status: row.scan_status === "malicious" ? "malicious" : "clean",
    malicious: row.vt_malicious,
    suspicious: row.vt_suspicious,
    harmless: row.vt_harmless,
    analysisId: null,
  };
}

async function discardIfMalicious(env: Env, id: number, status: string): Promise<void> {
  if (status !== "malicious" || !env.DB || !env.FILES) return;
  const row = await getMailFile(env.DB, id);
  if (!row) return;
  await env.FILES.delete(row.storage_key);
}

async function readStoredBytes(bucket: KVNamespace, storageKey: string): Promise<Uint8Array | null> {
  const value = await bucket.get(storageKey, "arrayBuffer");
  return value ? new Uint8Array(value) : null;
}

export async function scanStoredFiles(
  env: Env,
  files: Array<{ id: number; bytes?: Uint8Array | null; sha256: string; filename: string; analysisId?: string | null }>,
  options: { poll?: boolean } = {},
): Promise<void> {
  const db = env.DB;
  const key = env.VIRUSTOTAL_API_KEY;
  if (!db || files.length === 0) return;
  for (const file of files) {
    if (!Number.isInteger(file.id) || file.id <= 0) continue;
    const copied = await priorVerdict(db, file.sha256);
    if (copied && !file.analysisId) {
      await saveOutcome(db, file.id, copied);
      await discardIfMalicious(env, file.id, copied.status);
      continue;
    }
    if (!key) continue;
    let bytes = file.bytes ?? null;
    if (!bytes && env.FILES) {
      const row = await getMailFile(db, file.id);
      if (!row) continue;
      bytes = await readStoredBytes(env.FILES, row.storage_key);
    }
    if (!bytes) continue;
    try {
      const outcome = await inspectWithVirusTotal(key, bytes, file.sha256, file.filename, {
        poll: options.poll,
        analysisId: file.analysisId,
      });
      await saveOutcome(db, file.id, outcome);
      await discardIfMalicious(env, file.id, outcome.status);
    } catch (err) {
      console.error("virus_total_failed", err instanceof Error ? err.name : "error");
    }
  }
}

export async function mailboxIdForMessage(db: D1Database, messageId: number): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT t.mailbox_id AS mailbox_id
         FROM mail_messages m
         JOIN mail_threads t ON t.id = m.thread_id
        WHERE m.id = ?
        LIMIT 1`,
    )
    .bind(messageId)
    .first<{ mailbox_id: number }>();
  return row?.mailbox_id ?? null;
}

export async function refreshPendingFiles(env: Env, rows: MailFileRow[]): Promise<void> {
  const pending = rows.filter((row) => row.scan_status === "pending" || row.scan_status === "error").slice(0, 3);
  await scanStoredFiles(
    env,
    pending.map((row) => ({
      id: row.id,
      sha256: row.sha256,
      filename: row.filename,
      analysisId: row.vt_analysis_id,
    })),
    { poll: false },
  );
}

export function fileHref(id: number): string {
  return `/api/admin/datei?id=${id}`;
}

export async function removeStoredFiles(env: Env | undefined, keys: string[]): Promise<void> {
  if (!env?.FILES || keys.length === 0) return;
  await Promise.all(
    keys.map(async (key) => {
      try {
        await env.FILES?.delete(key);
      } catch (err) {
        console.error("file_delete_failed", err);
      }
    }),
  );
}

export { canOpenScan };

