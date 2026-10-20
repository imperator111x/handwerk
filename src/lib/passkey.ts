import { cfEnv } from "./cf";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { APIContext } from "astro";
import { createSession } from "./auth";
import { findUserById } from "./db";
import { passkeyDeviceLabel } from "./passkey-label";
import { bytesFromBase64Url, bytesToBase64Url } from "./web-push";

const CHALLENGE_COOKIE = "zs_passkey";
const CHALLENGE_TTL = 60 * 5;
const TRANSPORTS = new Set<AuthenticatorTransport>([
  "ble",
  "hybrid",
  "internal",
  "nfc",
  "usb",
]);

function transportsOf(value: string): AuthenticatorTransport[] | undefined {
  const list = value
    .split(",")
    .filter((item): item is AuthenticatorTransport =>
      TRANSPORTS.has(item as AuthenticatorTransport),
    );
  return list.length > 0 ? list : undefined;
}

export interface PasskeyRow {
  id: number;
  user_id: number;
  credential_id: string;
  public_key: string;
  counter: number;
  transports: string;
  label: string;
  created_at: number;
  last_used_at: number | null;
}

export function relyingParty(url: URL): { rpID: string; origins: string[] } {
  const host = url.hostname.toLowerCase();
  if (host === "zeus-service.de" || host === "www.zeus-service.de") {
    return {
      rpID: "zeus-service.de",
      origins: ["https://zeus-service.de", "https://www.zeus-service.de"],
    };
  }
  return { rpID: host, origins: [`https://${host}`] };
}

function challengeKey(challenge: string): string {
  return `webauthn:${challenge}`;
}

async function rememberChallenge(ctx: APIContext, challenge: string, userId: number | null): Promise<void> {
  const kv = cfEnv()?.SESSIONS;
  if (kv) {
    await kv.put(challengeKey(challenge), JSON.stringify({ userId }), { expirationTtl: CHALLENGE_TTL });
  }
  ctx.cookies.set(CHALLENGE_COOKIE, challenge, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_TTL,
  });
}

async function takeChallenge(ctx: APIContext): Promise<{ challenge: string; userId: number | null } | null> {
  const challenge = ctx.cookies.get(CHALLENGE_COOKIE)?.value;
  ctx.cookies.delete(CHALLENGE_COOKIE, { path: "/" });
  if (!challenge) return null;
  const kv = cfEnv()?.SESSIONS;
  if (!kv) return { challenge, userId: null };
  const raw = await kv.get(challengeKey(challenge));
  await kv.delete(challengeKey(challenge));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: number | null };
    return { challenge, userId: parsed.userId ?? null };
  } catch {
    return null;
  }
}

export async function listPasskeys(db: D1Database, userId: number): Promise<PasskeyRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, user_id, credential_id, public_key, counter, transports, label, created_at, last_used_at
         FROM passkeys WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all<PasskeyRow>();
  return results ?? [];
}

export async function findPasskey(db: D1Database, credentialId: string): Promise<PasskeyRow | null> {
  const row = await db
    .prepare(
      `SELECT id, user_id, credential_id, public_key, counter, transports, label, created_at, last_used_at
         FROM passkeys WHERE credential_id = ? LIMIT 1`,
    )
    .bind(credentialId)
    .first<PasskeyRow>();
  return row ?? null;
}

export async function registrationOptions(ctx: APIContext, user: { id: number; username: string }): Promise<unknown> {
  const { rpID } = relyingParty(new URL(ctx.request.url));
  const db = cfEnv()?.DB;
  const existing = db ? await listPasskeys(db, user.id) : [];
  const options = await generateRegistrationOptions({
    rpName: "Zeus-Service",
    rpID,
    userName: user.username,
    userID: new TextEncoder().encode(String(user.id)),
    userDisplayName: user.username,
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "required",
      userVerification: "required",
    },
    excludeCredentials: existing.map((row) => ({
      id: row.credential_id,
      transports: transportsOf(row.transports),
    })),
    preferredAuthenticatorType: "localDevice",
  });
  await rememberChallenge(ctx, options.challenge, user.id);
  return options;
}

export async function saveRegistration(ctx: APIContext, userId: number, response: RegistrationResponseJSON): Promise<boolean> {
  const db = cfEnv()?.DB;
  const pending = await takeChallenge(ctx);
  if (!db || !pending || pending.userId !== userId) return false;
  const { rpID, origins } = relyingParty(new URL(ctx.request.url));
  const verified = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: true,
  });
  if (!verified.verified) return false;
  const credential = verified.registrationInfo.credential;
  await db
    .prepare(
      `INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, label)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(credential_id) DO UPDATE SET
         public_key = excluded.public_key,
         counter = excluded.counter,
         transports = excluded.transports,
         label = excluded.label`,
    )
    .bind(
      userId,
      credential.id,
      bytesToBase64Url(credential.publicKey.slice()),
      credential.counter,
      (credential.transports ?? ["internal"]).join(","),
      passkeyDeviceLabel(ctx.request.headers.get("user-agent") ?? ""),
    )
    .run();
  return true;
}

export async function authenticationOptions(ctx: APIContext): Promise<unknown> {
  const { rpID } = relyingParty(new URL(ctx.request.url));
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: [],
  });
  await rememberChallenge(ctx, options.challenge, null);
  return options;
}

export async function loginWithPasskey(ctx: APIContext, response: AuthenticationResponseJSON): Promise<boolean> {
  const db = cfEnv()?.DB;
  const pending = await takeChallenge(ctx);
  if (!db || !pending) return false;
  const row = await findPasskey(db, response.id);
  if (!row) return false;
  const user = await findUserById(db, row.user_id);
  if (!user) return false;
  const { rpID, origins } = relyingParty(new URL(ctx.request.url));
  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origins,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: row.credential_id,
      publicKey: bytesFromBase64Url(row.public_key).slice(),
      counter: row.counter,
      transports: transportsOf(row.transports),
    },
  });
  if (!verified.verified) return false;
  await db
    .prepare(`UPDATE passkeys SET counter = ?, last_used_at = unixepoch() WHERE id = ?`)
    .bind(verified.authenticationInfo.newCounter, row.id)
    .run();
  await createSession(ctx, { username: user.username, userId: user.id, role: user.role });
  return true;
}

export async function deletePasskey(db: D1Database, userId: number, id: number): Promise<boolean> {
  const result = await db.prepare(`DELETE FROM passkeys WHERE id = ? AND user_id = ?`).bind(id, userId).run();
  return (result.meta.changes ?? 0) > 0;
}
