import type { APIContext } from "astro";
import { cfEnv } from "../../../lib/cf";
import { invoiceNumber } from "../../../lib/invoice";
import { findInvoiceIdByPaymentReference, getInvoice, recordOnlinePayment, recordRefund } from "../../../lib/invoices";
import { notifyStaff } from "../../../lib/notify";
import { formatEuro } from "../../../lib/quote";
import { decideStripeEvent, readCheckoutPaymentMethod, setStripePaymentLinkActive, verifyStripeSignature } from "../../../lib/stripe-pay";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  const env = cfEnv();
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const payload = await ctx.request.text();
  const header = ctx.request.headers.get("stripe-signature") ?? "";
  const valid = await verifyStripeSignature(payload, header, secret, Math.floor(Date.now() / 1000));
  if (!valid) return new Response("Signatur ungültig", { status: 400 });

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("JSON ungültig", { status: 400 });
  }
  const db = env.DB;
  if (!db) return new Response("Datenbank fehlt", { status: 500 });

  const decision = decideStripeEvent(event);
  if (decision.kind === "ignore") return json({ received: true });

  if (decision.kind === "refund") {
    const invoiceId = decision.invoiceId ?? (await findInvoiceIdByPaymentReference(db, decision.reference));
    if (!invoiceId) return json({ received: true, ignored: "missing" });
    const result = await recordRefund(db, invoiceId, decision.reference, decision.full);
    if (result === "refunded") await notifyPayment(ctx, env, invoiceId, "Rechnung erstattet", "Die Online-Zahlung wurde vollständig erstattet.");
    return json({ received: true, result });
  }

  const method = env.STRIPE_SECRET_KEY
    ? await readCheckoutPaymentMethod(env.STRIPE_SECRET_KEY, decision.sessionId)
    : "Online";
  const result = await recordOnlinePayment(db, decision.invoiceId, {
    amountCents: decision.amountCents,
    reference: decision.reference,
    method,
    paidAt: Math.floor(Date.now() / 1000),
  });
  if (result === "mismatch") {
    console.error("invoice_payment_amount_mismatch", decision.invoiceId, decision.amountCents);
    return json({ received: true, result });
  }
  if (result === "paid" && decision.paymentLinkId && env.STRIPE_SECRET_KEY) {
    try {
      await setStripePaymentLinkActive(env.STRIPE_SECRET_KEY, decision.paymentLinkId, false);
    } catch (err) {
      console.error("invoice_payment_link_close_failed", err instanceof Error ? err.message : "error");
    }
  }
  if (result === "paid" || result === "noted") {
    const row = await getInvoice(db, decision.invoiceId);
    const number = row ? invoiceNumber(row.id, row.invoice_date) : String(decision.invoiceId);
    const title = result === "paid" ? "Rechnung bezahlt" : "Weitere Zahlung";
    const body =
      result === "paid"
        ? `${number} ist bezahlt: ${formatEuro(decision.amountCents)} per ${method}.`
        : `${number}: eine weitere Online-Zahlung ist eingegangen.`;
    await notifyPayment(ctx, env, decision.invoiceId, title, body);
  }
  return json({ received: true, result });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function notifyPayment(ctx: APIContext, env: Env, invoiceId: number, title: string, body: string): Promise<void> {
  const job = notifyStaff(env, { title, body, url: `/admin/rechnungen/${invoiceId}` });
  const runtimeCtx = ctx.locals.cfContext;
  if (runtimeCtx) runtimeCtx.waitUntil(job);
  else await job;
}
