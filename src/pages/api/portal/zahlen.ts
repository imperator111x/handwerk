import type { APIContext } from "astro";
import { cfEnv } from "../../../lib/cf";
import { getDb } from "../../../lib/db";
import { getInvoice } from "../../../lib/invoices";
import { ensureInvoicePaymentUrl } from "../../../lib/invoice-payment-link";
import { requirePortalSession } from "../../../lib/portal-auth";

export const prerender = false;

export async function GET(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requirePortalSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const env = cfEnv();
  const id = Number.parseInt(ctx.url.searchParams.get("id") ?? "", 10);
  if (!db || !env || !Number.isFinite(id) || id <= 0) {
    return ctx.redirect("/portal?portal=pay-bad", 303);
  }
  const row = await getInvoice(db, id);
  if (!row || row.customer_id !== session.customerId) {
    return ctx.redirect("/portal?portal=pay-bad", 303);
  }
  const url = await ensureInvoicePaymentUrl(env, db, row);
  if (!url) return ctx.redirect("/portal?portal=pay-fail", 303);
  return ctx.redirect(url, 303);
}
