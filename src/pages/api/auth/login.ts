import type { APIContext } from "astro";
import { attemptLogin } from "../../../lib/auth";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  let username = "";
  let password = "";
  let next = "/admin";
  const contentType = ctx.request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await ctx.request.json()) as Record<string, unknown>;
      username = String(body.username ?? "").trim();
      password = String(body.password ?? "");
      if (typeof body.next === "string") next = body.next;
    } else {
      const form = await ctx.request.formData();
      username = String(form.get("username") ?? "").trim();
      password = String(form.get("password") ?? "");
      const n = form.get("next");
      if (typeof n === "string" && n) next = n;
    }
  } catch (_err) {
    return redirectError(ctx, next, "invalid");
  }

  if (!username || !password) {
    return redirectError(ctx, next, "missing");
  }

  const ok = await attemptLogin(ctx, username, password);
  if (!ok) {
    return redirectError(ctx, next, "credentials");
  }

  if (!next.startsWith("/") || next.startsWith("//")) {
    next = "/admin";
  }
  return ctx.redirect(next, 303);
}

function redirectError(
  ctx: APIContext,
  next: string,
  code: string,
): Response {
  const url = new URL("/login", ctx.url);
  url.searchParams.set("error", code);
  if (next && next !== "/admin") url.searchParams.set("next", next);
  return ctx.redirect(url.pathname + url.search, 303);
}
