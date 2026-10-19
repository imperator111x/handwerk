import type { APIContext } from "astro";
import { getDb } from "../../lib/db";
import { createHumanPass, HUMAN_COOKIE, HUMAN_MAX_AGE } from "../../lib/human-pass";
import { verifyTurnstile } from "../../lib/turnstile";
import { deviceLabel, recordVisit, safeVisitPath, visitorKey, visitSource } from "../../lib/visits";

export const prerender = false;

function countryFrom(request: Request): string | null {
  const value = request.headers.get("cf-ipcountry") ?? "";
  return /^[A-Z]{2}$/.test(value) && value !== "XX" ? value : null;
}

export async function POST(ctx: APIContext): Promise<Response> {
  let body: { token?: unknown; path?: unknown; referrer?: unknown; utm?: unknown; record?: unknown };
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    return new Response(null, { status: 400 });
  }

  const env = ctx.locals.runtime?.env;
  const remoteIp = ctx.request.headers.get("cf-connecting-ip") ?? "";
  const passed = await verifyTurnstile(
    env,
    body.token,
    remoteIp,
    "page_load",
    env?.TURNSTILE_PAGE_SECRET,
  );
  if (!passed) return new Response(null, { status: 403 });

  const pass = await createHumanPass(env);
  if (!pass) return new Response(null, { status: 403 });
  ctx.cookies.set(HUMAN_COOKIE, pass, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: HUMAN_MAX_AGE,
  });

  if (body.record === true) {
    const path = typeof body.path === "string" ? safeVisitPath(body.path) : null;
    const db = getDb(ctx);
    if (path && db) {
      try {
        const device = deviceLabel(ctx.request.headers.get("user-agent") ?? "");
        const pepper = env?.TURNSTILE_PAGE_SECRET || env?.SESSION_SECRET || "zeus-service-visits";
        await recordVisit(db, {
          path,
          source: visitSource(
            typeof body.referrer === "string" ? body.referrer : "",
            typeof body.utm === "string" ? body.utm : "",
          ),
          country: countryFrom(ctx.request),
          device,
          visitorKey: await visitorKey(remoteIp, device, pepper),
        });
      } catch (err) {
        console.error("visit_record_failed", err);
      }
    }
  }

  return new Response(null, { status: 204 });
}
