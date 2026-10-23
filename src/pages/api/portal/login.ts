import type { APIContext } from "astro";
import { attemptPortalLogin } from "../../../lib/portal-auth";

export const prerender = false;

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/portal") || raw.startsWith("//")) return "/portal";
  return raw;
}

export async function POST(ctx: APIContext): Promise<Response> {
  const form = await ctx.request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? ""));
  const ok = await attemptPortalLogin(ctx, email, password);
  if (!ok) return ctx.redirect(`/portal/login?portal=bad&next=${encodeURIComponent(next)}`, 303);
  return ctx.redirect(next, 303);
}
