import type { APIContext } from "astro";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { getSession } from "../../../lib/auth";
import { findUserById, getDb } from "../../../lib/db";
import {
  deletePasskey,
  identificationOptions,
  labelPasskeyFromAuthentication,
  listPasskeys,
  registrationOptions,
  saveRegistration,
} from "../../../lib/passkey";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(ctx: APIContext): Promise<Response> {
  const session = await getSession(ctx);
  if (!session?.userId) return json({ ok: false }, 401);
  const db = getDb(ctx);
  const user = db ? await findUserById(db, session.userId) : null;
  if (!db || !user) return json({ ok: false }, 401);
  if (new URL(ctx.request.url).searchParams.get("intent") === "identify") {
    const options = await identificationOptions(ctx, user.id);
    if (!options) return json({ ok: false }, 400);
    return json({ options });
  }
  const existing = await listPasskeys(db, user.id);
  const options = await registrationOptions(ctx, { id: user.id, username: user.username });
  return json({ options, registered: existing.length > 0 });
}

export async function POST(ctx: APIContext): Promise<Response> {
  const session = await getSession(ctx);
  if (!session?.userId) return json({ ok: false }, 401);
  let body: { purpose?: string; response?: RegistrationResponseJSON | AuthenticationResponseJSON };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ ok: false }, 400);
  }
  if (!body.response || typeof body.response !== "object") return json({ ok: false }, 400);
  try {
    const ok = body.purpose === "identify"
      ? await labelPasskeyFromAuthentication(ctx, session.userId, body.response as AuthenticationResponseJSON)
      : await saveRegistration(ctx, session.userId, body.response as RegistrationResponseJSON);
    if (!ok) return json({ ok: false }, 400);
  } catch (err) {
    console.error("passkey_register_failed", err);
    return json({ ok: false }, 400);
  }
  return json({ ok: true });
}

export async function DELETE(ctx: APIContext): Promise<Response> {
  const session = await getSession(ctx);
  const db = getDb(ctx);
  if (!session?.userId || !db) return json({ ok: false }, 401);
  const raw = new URL(ctx.request.url).searchParams.get("id") ?? "";
  if (!/^[1-9]\d*$/.test(raw)) return json({ ok: false }, 400);
  const removed = await deletePasskey(db, session.userId, Number(raw));
  if (!removed) return json({ ok: false }, 404);
  return json({ ok: true });
}
