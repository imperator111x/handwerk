import type { APIContext } from "astro";
import {
  hashPassword,
  requireSession,
  verifyPassword,
} from "../../../lib/auth";
import { findUserById, getDb, updateUserPassword } from "../../../lib/db";

export const prerender = false;

function safeRedirect(target: string | null, fallback: string): string {
  if (!target) return fallback;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;

  const db = getDb(ctx);
  const form = await ctx.request.formData();
  const current = String(form.get("current_password") ?? "");
  const next = String(form.get("new_password") ?? "");
  const confirm = String(form.get("confirm_password") ?? "");
  const redirectBase = safeRedirect(
    String(form.get("redirect") ?? ""),
    "/admin/einstellungen",
  );

  if (next.length < 10) {
    return ctx.redirect(`${redirectBase}?pw=too_short`, 303);
  }
  if (next !== confirm) {
    return ctx.redirect(`${redirectBase}?pw=mismatch`, 303);
  }
  if (!session.userId || !db) {
    return ctx.redirect(`${redirectBase}?pw=no_db`, 303);
  }

  const user = await findUserById(db, session.userId);
  if (!user) {
    return ctx.redirect(`${redirectBase}?pw=unknown_user`, 303);
  }

  const currentOk = await verifyPassword(current, user.password_hash);
  if (!currentOk) {
    return ctx.redirect(`${redirectBase}?pw=wrong_current`, 303);
  }

  const hash = await hashPassword(next);
  await updateUserPassword(db, user.id, hash);

  return ctx.redirect(`${redirectBase}?pw=ok`, 303);
}
