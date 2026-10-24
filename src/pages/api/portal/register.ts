import type { APIContext } from "astro";
import { getCustomer } from "../../../lib/customers";
import { getDb } from "../../../lib/db";
import { createPortalSession } from "../../../lib/portal-auth";
import { getPortalInviteByToken, inviteIsValid, registerPortalAccount } from "../../../lib/portal";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  const db = getDb(ctx);
  const form = await ctx.request.formData();
  const token = String(form.get("token") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const password2 = String(form.get("password2") ?? "");
  const back = `/portal/einladung/${token}`;
  if (!db || !token) return ctx.redirect("/portal/login?portal=bad", 303);
  if (password !== password2) return ctx.redirect(`${back}?portal=match`, 303);
  if (password.length < 8) return ctx.redirect(`${back}?portal=short`, 303);

  const invite = await getPortalInviteByToken(db, token);
  if (!invite || !inviteIsValid(invite)) return ctx.redirect(`${back}?portal=expired`, 303);
  const customer = await getCustomer(db, invite.customer_id);
  if (!customer) return ctx.redirect("/portal/login?portal=bad", 303);

  const account = await registerPortalAccount(db, { invite, password });
  if (!account) return ctx.redirect(`${back}?portal=exists`, 303);
  await createPortalSession(ctx, account);
  return ctx.redirect("/portal?portal=welcome", 303);
}
