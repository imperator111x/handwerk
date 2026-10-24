import type { APIContext } from "astro";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { authenticationOptions, loginWithPasskey } from "../../../lib/passkey";

export const prerender = false;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function safeNext(value: unknown): string {
  const next = typeof value === "string" ? value : "/admin";
  if (!next.startsWith("/") || next.startsWith("//")) return "/admin";
  return next;
}

export async function GET(ctx: APIContext): Promise<Response> {
  const options = await authenticationOptions(ctx);
  return json(options);
}

export async function POST(ctx: APIContext): Promise<Response> {
  let body: { response?: AuthenticationResponseJSON; next?: string };
  try {
    body = await ctx.request.json();
  } catch {
    return json({ ok: false }, 400);
  }
  if (!body.response || typeof body.response !== "object" || typeof body.response.id !== "string") {
    return json({ ok: false }, 400);
  }
  try {
    const ok = await loginWithPasskey(ctx, body.response);
    if (!ok) return json({ ok: false }, 401);
  } catch (err) {
    console.error("passkey_login_failed", err);
    return json({ ok: false }, 401);
  }
  return json({ ok: true, redirect: safeNext(body.next) });
}
