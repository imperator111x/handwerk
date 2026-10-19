/**
 * Datenbank-Helfer rund um das D1-Binding `env.DB`.
 *
 * Alle Funktionen liefern null/[] zurück, wenn die D1-Datenbank nicht
 * gebunden ist – so bleibt die App auch ohne D1 lauffähig und das Admin-
 * Panel kann sinnvoll „leer" rendern.
 */

import type { APIContext } from "astro";
import { formatUserSignature } from "./user-name";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  first_name: string;
  last_name: string;
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
      "SELECT id, username, password_hash, role, first_name, last_name, created_at, last_login_at FROM users WHERE username = ? LIMIT 1",
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

export interface ContactRequestListItem extends ContactRequestRow {
  inbound_count: number;
  last_reply_direction: "inbound" | "outbound" | null;
}

const CONTACT_LIST_SELECT = `
  SELECT c.*,
    (
      SELECT COUNT(*) FROM contact_replies r
      WHERE r.request_id = c.id AND r.direction = 'inbound'
    ) AS inbound_count,
    (
      SELECT r.direction FROM contact_replies r
      WHERE r.request_id = c.id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 1
    ) AS last_reply_direction
  FROM contact_requests c
`;

export async function listContactRequests(
  db: D1Database,
  options: { status?: ContactStatus | "all"; limit?: number } = {},
): Promise<ContactRequestListItem[]> {
  const limit = Math.min(options.limit ?? 100, 500);
  const query =
    options.status && options.status !== "all"
      ? `${CONTACT_LIST_SELECT} WHERE c.status = ? ORDER BY c.created_at DESC LIMIT ?`
      : `${CONTACT_LIST_SELECT} ORDER BY c.created_at DESC LIMIT ?`;
  const statement = db.prepare(query);
  const bound =
    options.status && options.status !== "all"
      ? statement.bind(options.status, limit)
      : statement.bind(limit);
  const { results } = await bound.all<ContactRequestListItem>();
  return (results ?? []).map(normalizeListItem);
}

function normalizeListItem(row: ContactRequestListItem): ContactRequestListItem {
  const direction = row.last_reply_direction;
  return {
    ...row,
    inbound_count: Number(row.inbound_count ?? 0),
    last_reply_direction:
      direction === "inbound" || direction === "outbound" ? direction : null,
  };
}

export async function countRequestsAwaitingReply(db: D1Database): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM contact_requests c
       WHERE (
         SELECT r.direction FROM contact_replies r
         WHERE r.request_id = c.id
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT 1
       ) = 'inbound'`,
    )
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
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
  first_name: string;
  last_name: string;
  created_at: number;
  last_login_at: number | null;
}

export async function listUsers(db: D1Database): Promise<UserPublic[]> {
  const { results } = await db
    .prepare(
      `SELECT id, username, role, first_name, last_name, created_at, last_login_at
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
      `SELECT id, username, password_hash, role, first_name, last_name, created_at, last_login_at
         FROM users WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<UserRow>();
  return row ?? null;
}

export async function createUser(
  db: D1Database,
  data: {
    username: string;
    passwordHash: string;
    role: UserRole;
    firstName: string;
    lastName: string;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO users (username, password_hash, role, first_name, last_name)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(data.username, data.passwordHash, data.role, data.firstName, data.lastName)
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function updateUserName(
  db: D1Database,
  userId: number,
  firstName: string,
  lastName: string,
): Promise<void> {
  await db
    .prepare(`UPDATE users SET first_name = ?, last_name = ? WHERE id = ?`)
    .bind(firstName, lastName, userId)
    .run();
}

export async function signatureNameForUser(
  db: D1Database,
  userId: number | undefined,
  fallbackUsername: string,
): Promise<string> {
  if (!userId) return fallbackUsername;
  const user = await findUserById(db, userId);
  if (!user) return fallbackUsername;
  return formatUserSignature(user.first_name, user.last_name, fallbackUsername);
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
  direction: "inbound" | "outbound";
  from_email: string | null;
  message_id: string | null;
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
  direction?: "inbound" | "outbound";
  from_email?: string | null;
  message_id?: string | null;
}

export async function insertReply(
  db: D1Database,
  data: ReplyInsert,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO contact_replies
         (request_id, user_id, author_name, subject, body, email_sent_at, email_status, email_error, direction, from_email, message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      data.direction ?? "outbound",
      data.from_email ?? null,
      data.message_id ?? null,
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function insertInboundReply(
  db: D1Database,
  data: {
    request_id: number;
    author_name: string;
    from_email: string;
    subject: string;
    body: string;
    message_id: string | null;
  },
): Promise<{ id: number; duplicate: boolean }> {
  if (data.message_id) {
    const existing = await db
      .prepare(`SELECT id, request_id FROM contact_replies WHERE message_id = ? LIMIT 1`)
      .bind(data.message_id)
      .first<{ id: number; request_id: number }>();
    if (existing) return { id: existing.id, duplicate: true };
  }

  try {
    const id = await insertReply(db, {
      request_id: data.request_id,
      user_id: null,
      author_name: data.author_name,
      subject: data.subject,
      body: data.body,
      email_status: "received",
      direction: "inbound",
      from_email: data.from_email,
      message_id: data.message_id,
    });
    return { id, duplicate: false };
  } catch (err) {
    if (data.message_id && String(err).toLowerCase().includes("unique")) {
      const existing = await db
        .prepare(`SELECT id FROM contact_replies WHERE message_id = ? LIMIT 1`)
        .bind(data.message_id)
        .first<{ id: number }>();
      if (existing) return { id: existing.id, duplicate: true };
    }
    throw err;
  }
}

export async function findLatestRequestIdBySender(
  db: D1Database,
  email: string,
): Promise<number | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const row = await db
    .prepare(
      `SELECT id FROM contact_requests
       WHERE lower(email) = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .bind(normalized)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function findRequestIdByMessageIds(
  db: D1Database,
  messageIds: string[],
): Promise<number | null> {
  const ids = [
    ...new Set(
      messageIds.flatMap((id) => {
        const bare = id.trim().replace(/^<|>$/g, "");
        return bare ? [bare, `<${bare}>`] : [];
      }),
    ),
  ].slice(0, 40);
  if (ids.length === 0) return null;
  const placeholders = ids.map(() => "?").join(", ");
  const row = await db
    .prepare(
      `SELECT request_id FROM contact_replies
       WHERE message_id IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(...ids)
    .first<{ request_id: number }>();
  return row?.request_id ?? null;
}

export async function latestInboundMessageId(
  db: D1Database,
  requestId: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT message_id FROM contact_replies
       WHERE request_id = ? AND direction = 'inbound' AND message_id IS NOT NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .bind(requestId)
    .first<{ message_id: string }>();
  return row?.message_id ?? null;
}

export interface MailboxRow {
  id: number;
  local_part: string;
  display_name: string;
  created_at: number;
  user_id: number | null;
  owner_name: string;
  owner_username: string;
  thread_count: number;
}

const MAILBOX_SELECT = `
  SELECT m.id, m.local_part, m.display_name, m.created_at, m.user_id,
         TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS owner_name,
         COALESCE(u.username, '') AS owner_username,
         (SELECT COUNT(*) FROM mail_threads t WHERE t.mailbox_id = m.id) AS thread_count
    FROM mailboxes m
    LEFT JOIN users u ON u.id = m.user_id
`;

export interface MailThreadRow {
  id: number;
  mailbox_id: number;
  peer_email: string;
  peer_name: string;
  subject: string;
  updated_at: number;
  local_part: string;
  display_name: string;
  preview: string;
  last_direction: "inbound" | "outbound" | null;
}

export interface MailMessageRow {
  id: number;
  thread_id: number;
  direction: "inbound" | "outbound";
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  message_id: string | null;
  email_sent_at: number | null;
  email_status: string | null;
  email_error: string | null;
  user_id: number | null;
  author_name: string;
  created_at: number;
}

export async function listMailboxes(
  db: D1Database,
  onlyUserId?: number,
): Promise<MailboxRow[]> {
  const scoped = Number.isInteger(onlyUserId);
  const { results } = await db
    .prepare(
      `${MAILBOX_SELECT}
        ${scoped ? "WHERE m.user_id = ?" : ""}
        ORDER BY m.local_part ASC`,
    )
    .bind(...(scoped ? [onlyUserId] : []))
    .all<MailboxRow>();
  return results ?? [];
}

export async function countMailboxes(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM mailboxes`).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function findMailboxById(
  db: D1Database,
  id: number,
): Promise<MailboxRow | null> {
  const row = await db
    .prepare(`${MAILBOX_SELECT} WHERE m.id = ? LIMIT 1`)
    .bind(id)
    .first<MailboxRow>();
  return row ?? null;
}

export async function findMailboxByLocalPart(
  db: D1Database,
  localPart: string,
): Promise<MailboxRow | null> {
  const row = await db
    .prepare(
      `${MAILBOX_SELECT} WHERE m.local_part = ? LIMIT 1`,
    )
    .bind(localPart)
    .first<MailboxRow>();
  return row ?? null;
}

export async function createMailbox(
  db: D1Database,
  localPart: string,
  displayName: string,
  userId: number | null,
): Promise<number> {
  const result = await db
    .prepare(`INSERT INTO mailboxes (local_part, display_name, user_id) VALUES (?, ?, ?)`)
    .bind(localPart, displayName, userId)
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function assignMailbox(
  db: D1Database,
  mailboxId: number,
  userId: number | null,
): Promise<void> {
  await db
    .prepare(`UPDATE mailboxes SET user_id = ? WHERE id = ?`)
    .bind(userId, mailboxId)
    .run();
}

export async function listMailThreads(
  db: D1Database,
  mailboxId: number,
): Promise<MailThreadRow[]> {
  const { results } = await db
    .prepare(
      `SELECT t.id, t.mailbox_id, t.peer_email, t.peer_name, t.subject, t.updated_at,
              m.local_part, m.display_name,
              COALESCE((
                SELECT body FROM mail_messages
                 WHERE thread_id = t.id
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1
              ), '') AS preview,
              (
                SELECT direction FROM mail_messages
                 WHERE thread_id = t.id
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1
              ) AS last_direction
         FROM mail_threads t
         JOIN mailboxes m ON m.id = t.mailbox_id
        WHERE t.mailbox_id = ?
        ORDER BY t.updated_at DESC
        LIMIT 200`,
    )
    .bind(mailboxId)
    .all<MailThreadRow>();
  return (results ?? []).map((row) => ({
    ...row,
    preview: row.preview ?? "",
    last_direction:
      row.last_direction === "inbound" || row.last_direction === "outbound"
        ? row.last_direction
        : null,
  }));
}

export async function getMailThread(
  db: D1Database,
  threadId: number,
): Promise<MailThreadRow | null> {
  const row = await db
    .prepare(
      `SELECT t.id, t.mailbox_id, t.peer_email, t.peer_name, t.subject, t.updated_at,
              m.local_part, m.display_name,
              '' AS preview,
              NULL AS last_direction
         FROM mail_threads t
         JOIN mailboxes m ON m.id = t.mailbox_id
        WHERE t.id = ?
        LIMIT 1`,
    )
    .bind(threadId)
    .first<MailThreadRow>();
  return row ?? null;
}

export async function upsertMailThread(
  db: D1Database,
  data: { mailboxId: number; peerEmail: string; peerName: string; subject: string },
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO mail_threads (mailbox_id, peer_email, peer_name, subject, updated_at)
       VALUES (?, ?, ?, ?, unixepoch())
       ON CONFLICT(mailbox_id, peer_email) DO UPDATE SET
         updated_at = unixepoch(),
         peer_name = CASE
           WHEN excluded.peer_name != '' THEN excluded.peer_name
           ELSE mail_threads.peer_name
         END,
         subject = CASE
           WHEN excluded.subject != '' THEN excluded.subject
           ELSE mail_threads.subject
         END
       RETURNING id`,
    )
    .bind(data.mailboxId, data.peerEmail, data.peerName, data.subject)
    .first<{ id: number }>();
  return Number(row?.id ?? 0);
}

export async function listMailMessages(
  db: D1Database,
  threadId: number,
): Promise<MailMessageRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM mail_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .bind(threadId)
    .all<MailMessageRow>();
  return results ?? [];
}

export async function findMailThreadIdByMessageIds(
  db: D1Database,
  messageIds: string[],
): Promise<number | null> {
  const ids = [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))].slice(0, 20);
  if (ids.length === 0) return null;
  const placeholders = ids.map(() => "?").join(", ");
  const row = await db
    .prepare(
      `SELECT thread_id FROM mail_messages
        WHERE message_id IN (${placeholders})
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .bind(...ids)
    .first<{ thread_id: number }>();
  return row?.thread_id ?? null;
}

export async function findMailMessageByMessageId(
  db: D1Database,
  messageId: string,
): Promise<{ id: number; thread_id: number } | null> {
  const row = await db
    .prepare(`SELECT id, thread_id FROM mail_messages WHERE message_id = ? LIMIT 1`)
    .bind(messageId)
    .first<{ id: number; thread_id: number }>();
  return row ?? null;
}

export async function latestInboundMailMessageId(
  db: D1Database,
  threadId: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT message_id FROM mail_messages
        WHERE thread_id = ? AND direction = 'inbound' AND message_id IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
    )
    .bind(threadId)
    .first<{ message_id: string }>();
  return row?.message_id ?? null;
}

export async function insertMailMessage(
  db: D1Database,
  data: {
    thread_id: number;
    direction: "inbound" | "outbound";
    from_email: string;
    to_email: string;
    subject: string;
    body: string;
    message_id?: string | null;
    email_sent_at?: number | null;
    email_status?: string | null;
    email_error?: string | null;
    user_id?: number | null;
    author_name: string;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO mail_messages
         (thread_id, direction, from_email, to_email, subject, body, message_id,
          email_sent_at, email_status, email_error, user_id, author_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      data.thread_id,
      data.direction,
      data.from_email,
      data.to_email,
      data.subject,
      data.body,
      data.message_id ?? null,
      data.email_sent_at ?? null,
      data.email_status ?? null,
      data.email_error ?? null,
      data.user_id ?? null,
      data.author_name,
    )
    .run();
  await db
    .prepare(`UPDATE mail_threads SET updated_at = unixepoch(), subject = ? WHERE id = ?`)
    .bind(data.subject, data.thread_id)
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
