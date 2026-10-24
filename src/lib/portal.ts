import { hashPassword } from "./auth";

export interface PortalInviteRow {
  id: number;
  customer_id: number;
  token: string;
  email: string;
  expires_at: number;
  used_at: number | null;
  created_at: number;
  created_by: number | null;
}

export interface PortalAccountRow {
  id: number;
  customer_id: number;
  email: string;
  password_hash: string;
  invite_id: number | null;
  created_at: number;
  last_login_at: number | null;
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getPortalAccountByEmail(
  db: D1Database,
  email: string,
): Promise<PortalAccountRow | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  return await db
    .prepare(
      `SELECT id, customer_id, email, password_hash, invite_id, created_at, last_login_at
         FROM portal_accounts WHERE lower(trim(email)) = ? LIMIT 1`,
    )
    .bind(key)
    .first<PortalAccountRow>();
}

export async function getPortalAccountByCustomer(
  db: D1Database,
  customerId: number,
): Promise<PortalAccountRow | null> {
  return await db
    .prepare(
      `SELECT id, customer_id, email, password_hash, invite_id, created_at, last_login_at
         FROM portal_accounts WHERE customer_id = ? LIMIT 1`,
    )
    .bind(customerId)
    .first<PortalAccountRow>();
}

export async function getPortalAccountById(
  db: D1Database,
  id: number,
): Promise<PortalAccountRow | null> {
  return await db
    .prepare(
      `SELECT id, customer_id, email, password_hash, invite_id, created_at, last_login_at
         FROM portal_accounts WHERE id = ?`,
    )
    .bind(id)
    .first<PortalAccountRow>();
}

export async function getPortalInviteByToken(
  db: D1Database,
  token: string,
): Promise<PortalInviteRow | null> {
  const value = token.trim();
  if (!/^[a-f0-9]{32,128}$/i.test(value)) return null;
  return await db
    .prepare(
      `SELECT id, customer_id, token, email, expires_at, used_at, created_at, created_by
         FROM portal_invites WHERE token = ? LIMIT 1`,
    )
    .bind(value)
    .first<PortalInviteRow>();
}

export async function createPortalInvite(
  db: D1Database,
  input: { customerId: number; email: string; createdBy?: number | null; ttlDays?: number },
): Promise<PortalInviteRow> {
  const token = randomToken(32);
  const now = Math.floor(Date.now() / 1000);
  const ttlDays = input.ttlDays ?? 14;
  const expiresAt = now + ttlDays * 86_400;
  const email = input.email.trim().toLowerCase();
  const result = await db
    .prepare(
      `INSERT INTO portal_invites (customer_id, token, email, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(input.customerId, token, email, expiresAt, input.createdBy ?? null)
    .run();
  const id = Number(result.meta.last_row_id ?? 0);
  return {
    id,
    customer_id: input.customerId,
    token,
    email,
    expires_at: expiresAt,
    used_at: null,
    created_at: now,
    created_by: input.createdBy ?? null,
  };
}

export function inviteIsValid(invite: PortalInviteRow, now = Math.floor(Date.now() / 1000)): boolean {
  if (invite.used_at) return false;
  if (invite.expires_at < now) return false;
  return true;
}

export async function registerPortalAccount(
  db: D1Database,
  input: { invite: PortalInviteRow; password: string },
): Promise<PortalAccountRow | null> {
  if (!inviteIsValid(input.invite)) return null;
  if (input.password.length < 8 || input.password.length > 200) return null;
  const existing = await getPortalAccountByCustomer(db, input.invite.customer_id);
  if (existing) return null;
  const passwordHash = await hashPassword(input.password);
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `INSERT INTO portal_accounts (customer_id, email, password_hash, invite_id, last_login_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(input.invite.customer_id, input.invite.email, passwordHash, input.invite.id, now)
    .run();
  const id = Number(result.meta.last_row_id ?? 0);
  if (!id) return null;
  await db
    .prepare(`UPDATE portal_invites SET used_at = ? WHERE id = ? AND used_at IS NULL`)
    .bind(now, input.invite.id)
    .run();
  return {
    id,
    customer_id: input.invite.customer_id,
    email: input.invite.email,
    password_hash: passwordHash,
    invite_id: input.invite.id,
    created_at: now,
    last_login_at: now,
  };
}

export async function touchPortalLogin(db: D1Database, accountId: number): Promise<void> {
  await db
    .prepare(`UPDATE portal_accounts SET last_login_at = unixepoch() WHERE id = ?`)
    .bind(accountId)
    .run();
}
