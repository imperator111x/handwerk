/**
 * Minimaler Auth-Layer für das Admin-Panel.
 *
 * Design-Entscheidungen:
 *  - Keine Fremd-Bibliothek: hält das Projekt klein und edge-kompatibel.
 *  - Password-Hash: PBKDF2 über Web Crypto (verfügbar in Cloudflare Workers).
 *  - Sessions: zufälliges Token in Cookie `zs_session`, serverseitig in
 *    Cloudflare KV (`SESSIONS`) gespeichert. Fallback: In-Memory (nur
 *    während Entwicklung sinnvoll).
 *  - Für den Start genügt ein einzelner Admin-User, dessen Hash als
 *    Wrangler-Secret `ADMIN_PASSWORD_HASH` hinterlegt wird.
 *
 * Später lässt sich dieser Layer gegen eine D1-basierte User-Tabelle oder
 * eine ausgewachsene Lösung (Lucia, better-auth) austauschen, ohne die
 * API-Verträge zu brechen.
 */

import type { APIContext } from "astro";
import { cfEnv } from "./cf";
import { findUserByUsername, touchUserLogin } from "./db";

export const SESSION_COOKIE = "zs_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 Stunden

export interface SessionData {
  username: string;
  userId?: number;
  role?: string;
  createdAt: number;
}

interface SessionStore {
  get(token: string): Promise<SessionData | null>;
  set(token: string, data: SessionData, ttlSeconds: number): Promise<void>;
  delete(token: string): Promise<void>;
}

const memoryStore = new Map<string, { data: SessionData; expiresAt: number }>();

const inMemoryStore: SessionStore = {
  async get(token) {
    const entry = memoryStore.get(token);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      memoryStore.delete(token);
      return null;
    }
    return entry.data;
  },
  async set(token, data, ttl) {
    memoryStore.set(token, {
      data,
      expiresAt: Date.now() + ttl * 1000,
    });
  },
  async delete(token) {
    memoryStore.delete(token);
  },
};

function kvStore(kv: KVNamespace): SessionStore {
  return {
    async get(token) {
      return await kv.get<SessionData>(`session:${token}`, "json");
    },
    async set(token, data, ttl) {
      await kv.put(`session:${token}`, JSON.stringify(data), {
        expirationTtl: ttl,
      });
    },
    async delete(token) {
      await kv.delete(`session:${token}`);
    },
  };
}

function getStore(env: Env): SessionStore {
  return env.SESSIONS ? kvStore(env.SESSIONS) : inMemoryStore;
}

function getEnv(_ctx: APIContext | App.Locals): Env {
  return cfEnv();
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): ArrayBuffer {
  const buf = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf.buffer);
}

/**
 * Erzeugt einen PBKDF2-Hash im Format `pbkdf2$<iter>$<salt_hex>$<hash_hex>`.
 * Nutzen Sie dies, um einen Produktions-Hash zu generieren und ihn als
 * Secret `ADMIN_PASSWORD_HASH` zu hinterlegen.
 */
export async function hashPassword(
  password: string,
  iterations = 100_000,
): Promise<string> {
  const saltBuf = new ArrayBuffer(16);
  const salt = new Uint8Array(saltBuf);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${iterations}$${toHex(saltBuf)}$${toHex(bits)}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number.parseInt(parts[1]!, 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const salt = fromHex(parts[2]!);
  const expected = new Uint8Array(fromHex(parts[3]!));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      key,
      expected.length * 8,
    ),
  );
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i++) {
    diff |= derived[i]! ^ expected[i]!;
  }
  return diff === 0;
}

export async function createSession(
  ctx: APIContext,
  data: Omit<SessionData, "createdAt">,
): Promise<string> {
  const env = getEnv(ctx);
  const token = randomToken();
  const store = getStore(env);
  await store.set(
    token,
    { ...data, createdAt: Date.now() },
    SESSION_TTL_SECONDS,
  );
  ctx.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function destroySession(ctx: APIContext): Promise<void> {
  const env = getEnv(ctx);
  const token = ctx.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    await getStore(env).delete(token);
  }
  ctx.cookies.delete(SESSION_COOKIE, { path: "/" });
}

export async function getSession(
  ctx: APIContext,
): Promise<SessionData | null> {
  const env = getEnv(ctx);
  const token = ctx.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return await getStore(env).get(token);
}

export async function requireSession(
  ctx: APIContext,
): Promise<SessionData | Response> {
  const session = await getSession(ctx);
  if (!session) {
    const next = encodeURIComponent(ctx.url.pathname + ctx.url.search);
    return ctx.redirect(`/login?next=${next}`);
  }
  return session;
}

/**
 * Login-Flow:
 *  1) Falls `env.DB` gebunden ist, zuerst in der `users`-Tabelle nachschlagen.
 *  2) Als Fallback (z. B. beim ersten Deploy ohne gesetzten DB-User) wird
 *     die Kombination aus `ADMIN_USERNAME` (Var) + `ADMIN_PASSWORD_HASH`
 *     (Secret) akzeptiert. So kommt man immer rein, auch bevor die
 *     users-Tabelle befuellt ist.
 */
export async function attemptLogin(
  ctx: APIContext,
  username: string,
  password: string,
): Promise<boolean> {
  const env = getEnv(ctx);

  if (env.DB) {
    try {
      const user = await findUserByUsername(env.DB, username);
      if (user) {
        const ok = await verifyPassword(password, user.password_hash);
        if (!ok) return false;
        await touchUserLogin(env.DB, user.id).catch(() => {});
        await createSession(ctx, {
          username: user.username,
          userId: user.id,
          role: user.role,
        });
        return true;
      }
    } catch (err) {
      console.error("db_user_lookup_failed", err);
    }
  }

  const expectedUser = env.ADMIN_USERNAME ?? "admin";
  const storedHash = env.ADMIN_PASSWORD_HASH;
  if (!storedHash) {
    console.warn(
      "Weder DB-User noch ADMIN_PASSWORD_HASH gesetzt – Login verweigert.",
    );
    return false;
  }
  if (username !== expectedUser) return false;
  const ok = await verifyPassword(password, storedHash);
  if (!ok) return false;
  await createSession(ctx, { username, role: "admin" });
  return true;
}
