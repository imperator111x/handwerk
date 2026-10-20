import type { APIContext } from "astro";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getSession } from "../../../lib/auth";
import { findUserById, getDb } from "../../../lib/db";
import { deletePasskeys, listPasskeys, registrationOptions, saveRegistration } from "../../../lib/passkey";

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
  const existing = await listPasskeys(db, user.id);
  const options = await registrationOptions(ctx, { id: user.id, username: user.username });
  return json({ options, registered: existing.length > 0 });
}

export async function POST(ctx: APIContext): Promise<Response> {
  const session = await getSession(ctx);
  if (!session?.userId) return json({ ok: false }, 401);
  let body: { response?: RegistrationResponseJSON };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ ok: false }, 400);
  }
  if (!body.response || typeof body.response !== "object") return json({ ok: false }, 400);
  try {
    const ok = await saveRegistration(ctx, session.userId, body.response);
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
  await deletePasskeys(db, session.userId);
  return json({ ok: true });
}
