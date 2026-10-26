/**
 * Verhindert Doppel-Anlage derselben eingehenden Mail (Message-ID oder Inhalt).
 */

const DEDUP_TTL_SECONDS = 7 * 24 * 60 * 60;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

export async function inboundDedupKeys(input: {
  messageId?: string | null;
  from: string;
  subject?: string | null;
  body: string;
}): Promise<string[]> {
  const keys: string[] = [];
  const mid = (input.messageId ?? "").trim().toLowerCase().replace(/^<|>$/g, "");
  if (mid) keys.push(`mid:${mid}`);

  const normalized = [
    input.from.trim().toLowerCase(),
    (input.subject ?? "").trim().toLowerCase().replace(/\s+/g, " "),
    input.body.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 4000),
  ].join("\n");
  keys.push(`body:${await sha256Hex(normalized)}`);
  return keys;
}

export async function findInboundDedup(
  db: D1Database,
  keys: string[],
): Promise<number | null> {
  if (keys.length === 0) return null;
  const cutoff = Math.floor(Date.now() / 1000) - DEDUP_TTL_SECONDS;
  for (const key of keys) {
    const row = await db
      .prepare(
        `SELECT request_id FROM inbound_dedup
          WHERE hash = ? AND created_at >= ? LIMIT 1`,
      )
      .bind(key, cutoff)
      .first<{ request_id: number | null }>();
    if (row?.request_id && row.request_id > 0) return row.request_id;
  }
  return null;
}

export async function rememberInboundDedup(
  db: D1Database,
  keys: string[],
  requestId: number | null,
): Promise<void> {
  if (keys.length === 0) return;
  const stmts = keys.map((key) =>
    db
      .prepare(
        `INSERT INTO inbound_dedup (hash, request_id, created_at)
         VALUES (?, ?, unixepoch())
         ON CONFLICT(hash) DO UPDATE SET
           request_id = COALESCE(excluded.request_id, inbound_dedup.request_id),
           created_at = excluded.created_at`,
      )
      .bind(key, requestId),
  );
  await db.batch(stmts);
}
