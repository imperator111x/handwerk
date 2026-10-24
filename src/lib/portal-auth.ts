import type { APIContext } from "astro";
import { verifyPassword } from "./auth";
import { cfEnv } from "./cf";
import { getDb } from "./db";
import {
  getPortalAccountByEmail,
  getPortalAccountById,
  touchPortalLogin,
  type PortalAccountRow,
} from "./portal";

export const PORTAL_COOKIE = "zs_portal";
const PORTAL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

export interface PortalSessionData {
  accountId: number;
  customerId: number;
  email: string;
  createdAt: number;
}

interface SessionStore {
  get(token: string): Promise<PortalSessionData | null>;
  set(token: string, data: PortalSessionData, ttlSeconds: number): Promise<void>;
  delete(token: string): Promise<void>;
}

const memoryStore = new Map<string, { data: PortalSessionData; expiresAt: number }>();

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
    memoryStore.set(token, { data, expiresAt: Date.now() + ttl * 1000 });
  },
  async delete(token) {
    memoryStore.delete(token);
  },
};

function kvStore(kv: KVNamespace): SessionStore {
  return {
    async get(token) {
      return await kv.get<PortalSessionData>(`portal:session:${token}`, "json");
    },
    async set(token, data, ttl) {
      await kv.put(`portal:session:${token}`, JSON.stringify(data), { expirationTtl: ttl });
    },
    async delete(token) {
      await kv.delete(`portal:session:${token}`);
    },
  };
}

function getStore(env: Env): SessionStore {
  return env.SESSIONS ? kvStore(env.SESSIONS) : inMemoryStore;
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createPortalSession(
  ctx: APIContext,
  account: PortalAccountRow,
): Promise<string> {
  const env = cfEnv();
  const token = randomToken();
  await getStore(env).set(
    token,
    {
      accountId: account.id,
      customerId: account.customer_id,
      email: account.email,
      createdAt: Date.now(),
    },
    PORTAL_TTL_SECONDS,
  );
  ctx.cookies.set(PORTAL_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: PORTAL_TTL_SECONDS,
  });
  return token;
}

export async function destroyPortalSession(ctx: APIContext): Promise<void> {
  const env = cfEnv();
  const token = ctx.cookies.get(PORTAL_COOKIE)?.value;
  if (token) await getStore(env).delete(token);
  ctx.cookies.delete(PORTAL_COOKIE, { path: "/" });
}

export async function getPortalSession(ctx: APIContext): Promise<PortalSessionData | null> {
  const env = cfEnv();
  const token = ctx.cookies.get(PORTAL_COOKIE)?.value;
  if (!token) return null;
  return await getStore(env).get(token);
}

export async function requirePortalSession(
  ctx: APIContext,
): Promise<PortalSessionData | Response> {
  const session = await getPortalSession(ctx);
  if (!session) {
    const next = encodeURIComponent(ctx.url.pathname + ctx.url.search);
    return ctx.redirect(`/portal/login?next=${next}`);
  }
  return session;
}

export async function attemptPortalLogin(
  ctx: APIContext,
  email: string,
  password: string,
): Promise<boolean> {
  const db = getDb(ctx);
  if (!db) return false;
  const account = await getPortalAccountByEmail(db, email);
  if (!account) return false;
  const ok = await verifyPassword(password, account.password_hash);
  if (!ok) return false;
  await touchPortalLogin(db, account.id).catch(() => {});
  await createPortalSession(ctx, account);
  return true;
}

export async function loadPortalAccount(
  ctx: APIContext,
  session: PortalSessionData,
): Promise<PortalAccountRow | null> {
  const db = getDb(ctx);
  if (!db) return null;
  return getPortalAccountById(db, session.accountId);
}
