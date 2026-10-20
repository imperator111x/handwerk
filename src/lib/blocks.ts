export type BlockKind = "email" | "ip";

export interface SenderBlock {
  id: number;
  kind: BlockKind;
  value: string;
  note: string | null;
  created_at: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeBlockEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 200 || !EMAIL.test(email)) return null;
  return email;
}

export function normalizeBlockIp(raw: string): string | null {
  const ip = raw.split(",")[0]?.trim() ?? "";
  if (!ip || ip.toLowerCase() === "unknown" || ip.length > 80) return null;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const parts = ip.split(".").map((part) => Number(part));
    if (parts.some((part) => part > 255)) return null;
    return ip;
  }
  if (ip.includes(":") && /^[0-9a-f:]+$/i.test(ip)) return ip.toLowerCase();
  return null;
}

export function isOwnMailboxEmail(email: string, domain = "zeus-service.de"): boolean {
  return email.endsWith(`@${domain.replace(/^@/, "").toLowerCase()}`);
}

export async function blockTargets(
  db: D1Database,
  input: { email?: string | null; ip?: string | null; note?: string | null; domain?: string },
): Promise<{ email: boolean; ip: boolean }> {
  const email = input.email ? normalizeBlockEmail(input.email) : null;
  const ip = input.ip ? normalizeBlockIp(input.ip) : null;
  const saved = { email: false, ip: false };
  const note = input.note?.trim().slice(0, 160) || null;
  if (email && !isOwnMailboxEmail(email, input.domain)) {
    await db
      .prepare(
        `INSERT INTO sender_blocks (kind, value, note) VALUES ('email', ?, ?)
         ON CONFLICT(kind, value) DO NOTHING`,
      )
      .bind(email, note)
      .run();
    saved.email = true;
  }
  if (ip) {
    await db
      .prepare(
        `INSERT INTO sender_blocks (kind, value, note) VALUES ('ip', ?, ?)
         ON CONFLICT(kind, value) DO NOTHING`,
      )
      .bind(ip, note)
      .run();
    saved.ip = true;
  }
  return saved;
}

export async function blockedKinds(
  db: D1Database,
  input: { email?: string | null; ip?: string | null },
): Promise<{ email: boolean; ip: boolean }> {
  const email = input.email ? normalizeBlockEmail(input.email) : null;
  const ip = input.ip ? normalizeBlockIp(input.ip) : null;
  const found = { email: false, ip: false };
  if (!email && !ip) return found;
  const { results } = await db
    .prepare(
      `SELECT kind FROM sender_blocks
        WHERE (kind = 'email' AND value = ?) OR (kind = 'ip' AND value = ?)`,
    )
    .bind(email ?? "", ip ?? "")
    .all<{ kind: BlockKind }>();
  for (const row of results ?? []) {
    if (row.kind === "email" && email) found.email = true;
    if (row.kind === "ip" && ip) found.ip = true;
  }
  return found;
}

export async function listSenderBlocks(db: D1Database): Promise<SenderBlock[]> {
  const { results } = await db
    .prepare(`SELECT id, kind, value, note, created_at FROM sender_blocks ORDER BY created_at DESC, id DESC`)
    .all<SenderBlock>();
  return results ?? [];
}

export async function removeSenderBlock(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM sender_blocks WHERE id = ?`).bind(id).run();
}
