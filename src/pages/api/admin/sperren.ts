import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { blockTargets, isOwnMailboxEmail, normalizeBlockEmail, normalizeBlockIp, removeSenderBlock } from "../../../lib/blocks";
import { cfEnv } from "../../../lib/cf";
import { getDb } from "../../../lib/db";

export const prerender = false;

function safeRedirect(target: string | null, fallback: string): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) return fallback;
  const [path, query] = target.split("?");
  const params = new URLSearchParams(query ?? "");
  params.delete("sperre");
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

function withFlag(target: string, flag: string): string {
  const url = new URL(target, "https://zeus-service.de");
  url.searchParams.set("sperre", flag);
  return `${url.pathname}${url.search}`;
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const db = getDb(ctx);
  const form = await ctx.request.formData();
  const redirectTo = safeRedirect(String(form.get("redirect") ?? ""), "/admin/sperren");
  if (!db) return ctx.redirect(withFlag(redirectTo, "db"), 303);

  const action = String(form.get("action") ?? "");
  if (action === "unblock") {
    const id = Number.parseInt(String(form.get("id") ?? ""), 10);
    if (!Number.isInteger(id) || id <= 0) return ctx.redirect(withFlag(redirectTo, "bad"), 303);
    await removeSenderBlock(db, id);
    return ctx.redirect(withFlag(redirectTo, "lifted"), 303);
  }

  const domain = cfEnv()?.REPLY_DOMAIN || "zeus-service.de";
  const email = normalizeBlockEmail(String(form.get("email") ?? ""));
  const ip = normalizeBlockIp(String(form.get("ip") ?? ""));
  const ownEmail = Boolean(email && isOwnMailboxEmail(email, domain));
  if (!email && !ip) return ctx.redirect(withFlag(redirectTo, "empty"), 303);
  if (ownEmail && !ip) return ctx.redirect(withFlag(redirectTo, "own"), 303);
  const saved = await blockTargets(db, {
    email: ownEmail ? null : email,
    ip,
    note: String(form.get("note") ?? ""),
    domain,
  });
  if (!saved.email && !saved.ip) return ctx.redirect(withFlag(redirectTo, ownEmail ? "own" : "empty"), 303);
  return ctx.redirect(withFlag(redirectTo, "saved"), 303);
}
