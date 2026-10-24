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
      livemode: true,
    },
  },
});
assert.equal(paid.kind, "paid");
if (paid.kind === "paid") {
  assert.equal(paid.invoiceId, 7);
  assert.equal(paid.amountCents, 12750);
  assert.equal(paid.reference, "pi_123");
  assert.equal(paid.test, false);
}
const testPay = pay.decideStripeEvent({
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test_1",
      payment_status: "paid",
      currency: "eur",
      amount_total: 12750,
      payment_intent: "pi_test",
      payment_link: "plink_test",
      metadata: { invoice_id: "7" },
      livemode: false,
    },
  },
});
assert.equal(testPay.kind, "paid");
if (testPay.kind === "paid") assert.equal(testPay.test, true);

assert.equal(
  pay.decideStripeEvent({
    type: "checkout.session.completed",
    data: { object: { id: "cs_test_123", payment_status: "unpaid", currency: "eur", amount_total: 12750, payment_intent: "pi_123", metadata: { invoice_id: "7" }, livemode: true } },
  }).kind,
  "ignore",
);

const later = pay.decideStripeEvent({
  type: "checkout.session.async_payment_succeeded",
  data: { object: { id: "cs_test_9", payment_status: "paid", currency: "eur", amount_total: 5000, payment_intent: { id: "pi_sepa" }, metadata: { invoice_id: 3 }, livemode: true } },
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
const exercise = pay.applyTestPayment(open, { amountCents: 12750, reference: "pi_test", method: "Karte", paidAt: now });
assert.equal(exercise.kind, "test");
if (exercise.kind === "test") assert.match(exercise.note, /kein Geld/);
assert.equal(pay.applyTestPayment({ ...open, status: "bezahlt", reference: "pi_123" }, { amountCents: 12750, reference: "pi_test", method: "Karte", paidAt: now }).kind, "unchanged");
assert.equal(pay.stripeKeyMode("sk_test_abc"), "test");
assert.equal(pay.stripeKeyMode("sk_live_abc"), "live");
assert.equal(pay.paymentStatusLabel("offen"), "Offen");
assert.equal(pay.paymentStatusLabel("bezahlt"), "Bezahlt");
assert.equal(pay.paymentStatusLabel("test"), "Testzahlung");
assert.equal(pay.paymentStatusLabel("storniert"), "Storniert");
assert.equal(pay.invoiceStatusLabel("offen", "storno"), "Stornorechnung");
assert.equal(pay.applyOnlinePayment(open, { amountCents: 12750, reference: "pi_late", method: "Karte", paidAt: now }).kind, "paid");
assert.equal(pay.applyOnlinePayment({ ...open, status: "storniert" }, { amountCents: 12750, reference: "pi_late", method: "Karte", paidAt: now }).kind, "noted");
const price = pay.stripePriceParams("R-2026-0001", 10000);
assert.equal(price.get("product_data[name]"), "Rechnung R-2026-0001");
assert.equal(price.get("product_data[description]"), null);
assert.equal(price.get("unit_amount"), "10000");
assert.equal(pay.stripeStatementSuffix("R-2026-0001"), "R20260001");
assert.equal(pay.stripeStatementSuffix("r-2026-0009!!!"), "R20260009");
assert.ok(pay.stripeStatementSuffix("R-2026-0001").length <= 10);
assert.equal(pay.stripeStatementSuffix("R-2026-123456"), "R202612345");
const linkParams = pay.paymentLinkParams(
  { invoiceId: 1, number: "R-2026-0001", email: "kunde@example.com" },
  "price_test",
  ["card"],
  false,
);
assert.equal(linkParams.get("payment_intent_data[statement_descriptor_suffix]"), "R20260001");
assert.equal(linkParams.get("payment_intent_data[description]"), "Rechnung R-2026-0001");
assert.equal(linkParams.get("payment_intent_data[metadata][invoice_number]"), "R-2026-0001");
const linkNoStmt = pay.paymentLinkParams(
  { invoiceId: 1, number: "R-2026-0001", email: "kunde@example.com" },
  "price_test",
  ["card"],
  false,
  true,
  false,
);
assert.equal(linkNoStmt.get("payment_intent_data[statement_descriptor_suffix]"), null);

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
const payFirst = email.renderReplyEmailText({
  siteName: "Zeus-Service",
  siteUrl: "https://zeus-service.de",
  recipientName: "Erika",
  subject: "Rechnung R-2026-0001",
  bodyText: "Rechnungstext",
  authorName: "Leon Lütcke",
  fromEmail: "info@zeus-service.de",
  ctaUrl: link,
  ctaLabel: "Jetzt bezahlen",
  ctaFirst: true,
});
assert.ok(payFirst.indexOf("Jetzt bezahlen:") < payFirst.indexOf("Rechnungstext"));
const invoiceHtml = email.renderReplyEmailHtml({
  siteName: "Zeus-Service",
  siteUrl: "https://zeus-service.de",
  recipientName: "Erika",
  subject: "Rechnung R-2026-0001: Rollladen einstellen",
  heading: "Rollladen einstellen",
  bodyText: "Fällig am 3. November 2026.\n\nDie Positionen stehen in der angehängten Rechnung.",
  authorName: "Leon Lütcke",
  fromEmail: "info@zeus-service.de",
  summaryLabel: "Gesamtbetrag",
  summaryAmount: "127,50 €",
  ctaUrl: link,
  ctaLabel: "Jetzt bezahlen",
  ctaFirst: true,
  ctaTone: "green",
  hideCtaUrl: true,
});
assert.match(invoiceHtml, /font-size:32px/);
assert.match(invoiceHtml, /#16a34a/);
assert.match(invoiceHtml, /border-radius:999px;color:#ffffff;background-color:#16a34a/);
assert.match(invoiceHtml, /td\.email-cta-green/);
assert.doesNotMatch(invoiceHtml, /bgcolor="#2563eb"/);
assert.match(invoiceHtml, /127,50 €/);
assert.match(invoiceHtml, /Rollladen einstellen/);
assert.doesNotMatch(invoiceHtml, /Stundenlohn/);
assert.doesNotMatch(invoiceHtml, /word-break:break-all/);
assert.match(invoiceHtml, /href="https:\/\/buy\.stripe\.com\//);
assert.match(invoiceHtml, /Jetzt bezahlen/);
const invoiceText = email.renderReplyEmailText({
  siteName: "Zeus-Service",
  siteUrl: "https://zeus-service.de",
  recipientName: "Erika",
  subject: "Rechnung R-2026-0001: Rollladen einstellen",
  bodyText: "Fällig am 3. November 2026.\n\nDie Positionen stehen in der angehängten Rechnung.",
  authorName: "Leon Lütcke",
  fromEmail: "info@zeus-service.de",
  summaryLabel: "Gesamtbetrag",
  summaryAmount: "127,50 €",
  ctaUrl: link,
  ctaLabel: "Jetzt bezahlen",
  ctaFirst: true,
});
assert.ok(invoiceText.indexOf("Gesamtbetrag:") < invoiceText.indexOf("Jetzt bezahlen:"));
assert.ok(invoiceText.indexOf("Jetzt bezahlen:") < invoiceText.indexOf("Fällig am"));
assert.match(invoiceText, /buy\.stripe\.com/);
assert.equal(invoiceText.split("Gesamtbetrag:").length, 2);
const leadHtml = email.renderReplyEmailHtml({
  siteName: "Zeus-Service",
  siteUrl: "https://zeus-service.de",
  recipientName: "Erika",
  subject: "Rechnung R-2026-0001",
  bodyText: "Fällig am 3. November 2026.",
  authorName: "Leon Lütcke",
  fromEmail: "info@zeus-service.de",
  summaryLabel: "Hiermit übersende ich Ihnen die Rechnung in Höhe von:",
  summaryAmount: "127,50 €",
});
assert.match(leadHtml, /Hiermit übersende ich Ihnen die Rechnung in Höhe von:/);
assert.doesNotMatch(leadHtml, /text-transform:uppercase[^>]*>Hiermit/);
const leadText = email.renderReplyEmailText({
  siteName: "Zeus-Service",
  siteUrl: "https://zeus-service.de",
  recipientName: "Erika",
  subject: "Rechnung R-2026-0001",
  bodyText: "Fällig am 3. November 2026.",
  authorName: "Leon Lütcke",
  fromEmail: "info@zeus-service.de",
  summaryLabel: "Hiermit übersende ich Ihnen die Rechnung in Höhe von:",
  summaryAmount: "127,50 €",
});
assert.match(leadText, /Hiermit übersende ich Ihnen die Rechnung in Höhe von:\n127,50 €/);
assert.doesNotMatch(leadText, /von::/);

console.log("stripe payment checks ok");

async function hmacHex(keySecret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(keySecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
