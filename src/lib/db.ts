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

export async function getContactRequest(
  db: D1Database,
  id: number,
): Promise<ContactRequestRow | null> {
  const row = await db
    .prepare(`SELECT * FROM contact_requests WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<ContactRequestRow>();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export type UserRole = "admin" | "editor";
export const USER_ROLES: UserRole[] = ["admin", "editor"];

export interface UserPublic {
  id: number;
  username: string;
  role: string;
  created_at: number;
  last_login_at: number | null;
}

export async function listUsers(db: D1Database): Promise<UserPublic[]> {
  const { results } = await db
    .prepare(
      `SELECT id, username, role, created_at, last_login_at
         FROM users ORDER BY created_at ASC`,
    )
    .all<UserPublic>();
  return results ?? [];
}

export async function findUserById(
  db: D1Database,
  id: number,
): Promise<UserRow | null> {
  const row = await db
    .prepare(
      `SELECT id, username, password_hash, role, created_at, last_login_at
         FROM users WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<UserRow>();
  return row ?? null;
}

export async function createUser(
  db: D1Database,
  data: { username: string; passwordHash: string; role: UserRole },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)`,
    )
    .bind(data.username, data.passwordHash, data.role)
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function updateUserPassword(
  db: D1Database,
  userId: number,
  passwordHash: string,
): Promise<void> {
  await db
    .prepare(`UPDATE users SET password_hash = ? WHERE id = ?`)
    .bind(passwordHash, userId)
    .run();
}

export async function updateUserRole(
  db: D1Database,
  userId: number,
  role: UserRole,
): Promise<void> {
  await db
    .prepare(`UPDATE users SET role = ? WHERE id = ?`)
    .bind(role, userId)
    .run();
}

export async function deleteUser(
  db: D1Database,
  userId: number,
): Promise<void> {
  await db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM users`)
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

export interface ContactReplyRow {
  id: number;
  request_id: number;
  user_id: number | null;
  author_name: string;
  subject: string;
  body: string;
  email_sent_at: number | null;
  email_status: string | null;
  email_error: string | null;
  created_at: number;
}

export interface ReplyInsert {
  request_id: number;
  user_id: number | null;
  author_name: string;
  subject: string;
  body: string;
  email_sent_at?: number | null;
  email_status?: string | null;
  email_error?: string | null;
}

export async function insertReply(
  db: D1Database,
  data: ReplyInsert,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO contact_replies
         (request_id, user_id, author_name, subject, body, email_sent_at, email_status, email_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.request_id,
      data.user_id,
      data.author_name,
      data.subject,
      data.body,
      data.email_sent_at ?? null,
      data.email_status ?? null,
      data.email_error ?? null,
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function listReplies(
  db: D1Database,
  requestId: number,
): Promise<ContactReplyRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM contact_replies
         WHERE request_id = ?
         ORDER BY created_at ASC`,
    )
    .bind(requestId)
    .all<ContactReplyRow>();
  return results ?? [];
}
