import { cfEnv } from "../../../lib/cf";
import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { deletePushSubscription, savePushSubscription } from "../../../lib/push-store";
import { pushEndpointAllowed } from "../../../lib/web-push";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  return json({ publicKey: cfEnv()?.VAPID_PUBLIC_KEY ?? null });
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  if (!db) return json({ ok: false }, 503);
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ ok: false }, 400);
  }
  const endpoint = String(body.endpoint ?? "");
  const p256dh = String(body.keys?.p256dh ?? "");
  const auth = String(body.keys?.auth ?? "");
  if (!pushEndpointAllowed(endpoint) || p256dh.length < 20 || p256dh.length > 200 || auth.length < 10 || auth.length > 80) {
    return json({ ok: false }, 400);
  }
  await savePushSubscription(db, session.userId ?? null, { endpoint, p256dh, auth });
  return json({ ok: true });
}

export async function DELETE(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const db = getDb(ctx);
  if (!db) return json({ ok: false }, 503);
  let endpoint = "";
  try {
    const body = (await ctx.request.json()) as { endpoint?: string };
    endpoint = String(body.endpoint ?? "");
  } catch {
    endpoint = "";
  }
  if (endpoint) await deletePushSubscription(db, endpoint);
  return json({ ok: true });
}
