/**
 * Datenbank-Helfer rund um das D1-Binding `env.DB`.
 *
 * Alle Funktionen liefern null/[] zurueck, wenn die D1-Datenbank nicht
 * gebunden ist – so bleibt die App auch ohne D1 lauffaehig und das Admin-
 * Panel kann sinnvoll „leer" rendern.
 */

import type { APIContext } from "astro";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  created_at: number;
  last_login_at: number | null;
}

export type ContactStatus = "new" | "in_progress" | "done" | "archived";

export interface ContactRequestRow {
  id: number;
  created_at: number;
  updated_at: number | null;
  name: string;
  email: string;
  phone: string | null;
  topic: string;
  message: string;
  status: ContactStatus;
  notes: string | null;
  ip: string | null;
  country: string | null;
  user_agent: string | null;
}

export interface ContactInsert {
  name: string;
  email: string;
  phone?: string | null;
  topic: string;
  message: string;
  ip?: string | null;
  country?: string | null;
  user_agent?: string | null;
}

export function getDb(ctx: APIContext | { locals: App.Locals }): D1Database | null {
  const env = ctx.locals.runtime?.env;
  return env?.DB ?? null;
}

export async function findUserByUsername(
  db: D1Database,
  username: string,
): Promise<UserRow | null> {
  const row = await db
    .prepare(
      "SELECT id, username, password_hash, role, created_at, last_login_at FROM users WHERE username = ? LIMIT 1",
    )
    .bind(username)
    .first<UserRow>();
  return row ?? null;
}

export async function touchUserLogin(
  db: D1Database,
  userId: number,
): Promise<void> {
  await db
    .prepare("UPDATE users SET last_login_at = unixepoch() WHERE id = ?")
    .bind(userId)
    .run();
}

export async function insertContactRequest(
  db: D1Database,
  data: ContactInsert,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO contact_requests
         (name, email, phone, topic, message, ip, country, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.name,
      data.email,
      data.phone ?? null,
      data.topic,
      data.message,
      data.ip ?? null,
      data.country ?? null,
      data.user_agent ?? null,
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function listContactRequests(
  db: D1Database,
  options: { status?: ContactStatus | "all"; limit?: number } = {},
): Promise<ContactRequestRow[]> {
  const limit = Math.min(options.limit ?? 100, 500);
  if (options.status && options.status !== "all") {
    const { results } = await db
      .prepare(
        `SELECT * FROM contact_requests
         WHERE status = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .bind(options.status, limit)
      .all<ContactRequestRow>();
    return results ?? [];
  }
  const { results } = await db
    .prepare(
      `SELECT * FROM contact_requests
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<ContactRequestRow>();
  return results ?? [];
}

export async function countContactRequestsByStatus(
  db: D1Database,
): Promise<Record<ContactStatus, number>> {
  const empty: Record<ContactStatus, number> = {
    new: 0,
    in_progress: 0,
    done: 0,
    archived: 0,
  };
  const { results } = await db
    .prepare(
      `SELECT status, COUNT(*) AS cnt FROM contact_requests GROUP BY status`,
    )
    .all<{ status: ContactStatus; cnt: number }>();
  for (const row of results ?? []) {
    empty[row.status] = row.cnt;
  }
  return empty;
}

export async function updateContactStatus(
  db: D1Database,
  id: number,
  status: ContactStatus,
): Promise<void> {
  await db
    .prepare(
      `UPDATE contact_requests
         SET status = ?, updated_at = unixepoch()
         WHERE id = ?`,
    )
    .bind(status, id)
    .run();
}

export async function deleteContactRequest(
  db: D1Database,
  id: number,
): Promise<void> {
  await db
    .prepare(`DELETE FROM contact_requests WHERE id = ?`)
    .bind(id)
    .run();
}
