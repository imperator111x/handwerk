import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.(?:ts|js|mjs|json)$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const pay = await import("../src/lib/stripe-pay.ts");
const email = await import("../src/lib/email.ts");

const secret = "whsec_test_secret_value";
const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
const now = 1_700_000_000;
const expected = await hmacHex(secret, `${now}.${payload}`);

assert.equal(await pay.verifyStripeSignature(payload, `t=${now},v1=${expected}`, secret, now), true);
assert.equal(await pay.verifyStripeSignature(payload, `t=${now},v1=${expected}`, "whsec_other_secret_value", now), false);
assert.equal(await pay.verifyStripeSignature(`${payload} `, `t=${now},v1=${expected}`, secret, now), false);
assert.equal(await pay.verifyStripeSignature(payload, `t=${now - 301},v1=${expected}`, secret, now), false);
assert.equal(await pay.verifyStripeSignature(payload, `t=${now},v1=abcd`, secret, now), false);
assert.equal(await pay.verifyStripeSignature(payload, `t=${now},v1=${expected}`, "pk_test_nope", now), false);

assert.equal(pay.stripePaymentsReady({ STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc" }), true);
assert.equal(pay.stripePaymentsReady({ STRIPE_SECRET_KEY: "pk_test_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc" }), false);
assert.equal(pay.stripePaymentsReady({ STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_WEBHOOK_SECRET: "" }), false);

const paid = pay.decideStripeEvent({
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_123",
      payment_status: "paid",
      currency: "eur",
      amount_total: 12750,
      payment_intent: "pi_123",
      payment_link: "plink_123",
      metadata: { invoice_id: "7" },
    },
  },
});
assert.equal(paid.kind, "paid");
if (paid.kind === "paid") {
  assert.equal(paid.invoiceId, 7);
  assert.equal(paid.amountCents, 12750);
  assert.equal(paid.reference, "pi_123");
}

assert.equal(
  pay.decideStripeEvent({
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_123", payment_status: "unpaid", currency: "eur", amount_total: 12750, payment_intent: "pi_123", metadata: { invoice_id: "7" } } },
  }).kind,
  "ignore",
);

const later = pay.decideStripeEvent({
  type: "checkout.session.async_payment_succeeded",
  data: { object: { id: "cs_test_9", payment_status: "paid", currency: "eur", amount_total: 5000, payment_intent: { id: "pi_sepa" }, metadata: { invoice_id: 3 } } },
});
assert.equal(later.kind, "paid");
if (later.kind === "paid") assert.equal(later.reference, "pi_sepa");

const refund = pay.decideStripeEvent({
  type: "charge.refunded",
  data: { object: { amount: 12750, amount_refunded: 12750, payment_intent: "pi_123", metadata: { invoice_id: "7" } } },
});
assert.equal(refund.kind, "refund");
if (refund.kind === "refund") assert.equal(refund.full, true);

const open = { priceCents: 12750, status: "offen", reference: null, method: null, paidAt: null, note: null };
assert.equal(pay.applyOnlinePayment(open, { amountCents: 100, reference: "pi_123", method: "Karte", paidAt: now }).kind, "mismatch");
const marked = pay.applyOnlinePayment(open, { amountCents: 12750, reference: "pi_123", method: "Karte", paidAt: now });
assert.equal(marked.kind, "paid");
const again = pay.applyOnlinePayment(
  { ...open, status: "bezahlt", reference: "pi_123", method: "Karte", paidAt: now },
  { amountCents: 12750, reference: "pi_123", method: "Karte", paidAt: now + 5 },
);
assert.equal(again.kind, "unchanged");
const extra = pay.applyOnlinePayment(
  { ...open, status: "bezahlt", reference: "pi_123", method: "Karte", paidAt: now },
  { amountCents: 12750, reference: "pi_999", method: "PayPal", paidAt: now + 5 },
);
assert.equal(extra.kind, "noted");
const transfer = pay.applyTransferPayment(open, now);
assert.equal(transfer.kind, "paid");
if (transfer.kind === "paid") assert.equal(pay.transferPayment({ ...open, status: "bezahlt", reference: transfer.reference, method: transfer.method, paidAt: now }), true);
assert.equal(pay.applyRefund({ ...open, status: "bezahlt", reference: "pi_123" }, { reference: "pi_123", full: false }).kind, "unchanged");
assert.equal(pay.applyRefund({ ...open, status: "bezahlt", reference: "pi_123" }, { reference: "pi_123", full: true }).kind, "refunded");

assert.equal(
  pay.labelPaymentMethod({ payment_intent: { payment_method: { type: "card", card: { wallet: { type: "apple_pay" } } } } }),
  "Apple Pay",
);
assert.equal(pay.labelPaymentMethod({ payment_intent: { payment_method: { type: "paypal" } } }), "PayPal");
assert.equal(pay.labelPaymentMethod({ payment_intent: { payment_method: { type: "sepa_debit" } } }), "SEPA-Lastschrift");
assert.equal(pay.paymentStatusLabel("offen"), "Offen");
assert.equal(pay.paymentStatusLabel("bezahlt"), "Bezahlt");

const link = pay.paymentLinkForMail("https://buy.stripe.com/test_abc", "kunde@example.com");
assert.match(link, /^https:\/\/buy\.stripe\.com\/test_abc\?/);
assert.match(link, /locale=de/);
assert.match(link, /prefilled_email=kunde%40example\.com/);
assert.equal(pay.paymentLinkForMail("http://buy.stripe.com/test_abc", "kunde@example.com"), "");

const text = email.renderReplyEmailText({
  siteName: "Zeus-Service",
  siteUrl: "https://zeus-service.de",
  recipientName: "Erika",
  subject: "Rechnung R-2026-0001",
  bodyText: "Rechnungstext",
  authorName: "Leon Lütcke",
  fromEmail: "info@zeus-service.de",
  ctaUrl: link,
  ctaLabel: "Jetzt bezahlen",
  footerNote: "Fällig am 3. November 2026.",
});
assert.match(text, /Jetzt bezahlen:/);
assert.match(text, /buy\.stripe\.com/);
assert.doesNotMatch(text, /Termin wählen/);

console.log("stripe payment checks ok");

async function hmacHex(keySecret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(keySecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
