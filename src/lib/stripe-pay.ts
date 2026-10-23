/**
 * Stripe-Zahlungslink für eine festgeschriebene Rechnung.
 * Keine Monatsgebühr: Karte, Apple Pay, Google Pay, PayPal und SEPA-Lastschrift.
 * Bezahlt wird die Rechnung erst nach geprüfter Stripe-Meldung.
 */

const TOLERANCE_SECONDS = 300;
const MIN_AMOUNT_CENTS = 50;

export interface PaymentRow {
  priceCents: number;
  status: string;
  reference: string | null;
  method: string | null;
  paidAt: number | null;
  note: string | null;
}

export type PaymentUpdate =
  | { kind: "unchanged" }
  | { kind: "paid"; paidAt: number; method: string; reference: string; note: string | null }
  | { kind: "test"; paidAt: number; method: string; reference: string; note: string }
  | { kind: "noted"; note: string }
  | { kind: "refunded" }
  | { kind: "mismatch" };

export const TEST_PAYMENT_NOTE = "Stripe-Testmodus: Es ist kein Geld eingegangen.";

export interface PaidEvent {
  kind: "paid";
  invoiceId: number;
  amountCents: number;
  reference: string;
  sessionId: string;
  paymentLinkId: string;
  test: boolean;
}

export interface RefundEvent {
  kind: "refund";
  invoiceId: number | null;
  reference: string;
  full: boolean;
}

export type StripeDecision = { kind: "ignore" } | PaidEvent | RefundEvent;

export function stripePaymentsReady(env: {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}): boolean {
  return stripeSecretUsable(env.STRIPE_SECRET_KEY) && webhookSecretUsable(env.STRIPE_WEBHOOK_SECRET);
}

export function stripeKeyMode(secret?: string): "test" | "live" | "off" {
  const value = secret?.trim() ?? "";
  if (value.startsWith("sk_test_") || value.startsWith("rk_test_")) return "test";
  if (value.startsWith("sk_live_") || value.startsWith("rk_live_")) return "live";
  return "off";
}

export function paymentStatusLabel(status: string): string {
  if (status === "bezahlt") return "Bezahlt";
  if (status === "erstattet") return "Erstattet";
  if (status === "storniert") return "Storniert";
  if (status === "test") return "Testzahlung";
  return "Offen";
}

export function invoiceStatusLabel(status: string, kind?: string | null): string {
  if (kind === "storno") return "Stornorechnung";
  return paymentStatusLabel(status);
}

export function paymentLinkForMail(url: string, email: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:") return "";
  parsed.searchParams.set("locale", "de");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) parsed.searchParams.set("prefilled_email", email);
  return parsed.toString();
}

export function applyOnlinePayment(
  row: PaymentRow,
  incoming: { amountCents: number; reference: string; method: string; paidAt: number },
): PaymentUpdate {
  if (incoming.amountCents !== row.priceCents) return { kind: "mismatch" };
  if (row.status === "bezahlt" && row.reference === incoming.reference) return { kind: "unchanged" };
  if (row.status === "storniert") return { kind: "noted", note: "Zahlung auf eine stornierte Rechnung." };
  if (row.status === "bezahlt" || row.status === "erstattet") {
    return { kind: "noted", note: "Weitere Online-Zahlung eingegangen." };
  }
  return {
    kind: "paid",
    paidAt: incoming.paidAt,
    method: incoming.method,
    reference: incoming.reference,
    note: null,
  };
}

export function applyTestPayment(
  row: PaymentRow,
  incoming: { amountCents: number; reference: string; method: string; paidAt: number },
): PaymentUpdate {
  if (incoming.amountCents !== row.priceCents) return { kind: "mismatch" };
  if (row.status === "bezahlt" || row.status === "erstattet" || row.status === "storniert") return { kind: "unchanged" };
  if (row.status === "test" && row.reference === incoming.reference) return { kind: "unchanged" };
  return {
    kind: "test",
    paidAt: incoming.paidAt,
    method: incoming.method,
    reference: incoming.reference,
    note: TEST_PAYMENT_NOTE,
  };
}

export function applyRefund(row: PaymentRow, incoming: { reference: string; full: boolean }): PaymentUpdate {
  if (!incoming.full || row.status !== "bezahlt" || row.reference !== incoming.reference) return { kind: "unchanged" };
  return { kind: "refunded" };
}

export function applyTransferPayment(row: PaymentRow, paidAt: number): PaymentUpdate {
  if (row.status !== "offen" && row.status !== "test") return { kind: "unchanged" };
  return {
    kind: "paid",
    paidAt,
    method: "Überweisung",
    reference: `ueberweisung-${paidAt}`,
    note: null,
  };
}

export function transferPayment(row: PaymentRow): boolean {
  return row.status === "bezahlt" && (row.reference ?? "").startsWith("ueberweisung-");
}

export function decideStripeEvent(event: unknown): StripeDecision {
  const root = asRecord(event);
  const type = root?.type;
  const object = asRecord(asRecord(root?.data)?.object);
  if (!object) return { kind: "ignore" };
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    if (object.payment_status !== "paid" || object.currency !== "eur") return { kind: "ignore" };
    const invoiceId = positiveInt(asRecord(object.metadata)?.invoice_id);
    const amount = object.amount_total;
    const reference = paymentIntentId(object.payment_intent);
    const sessionId = typeof object.id === "string" ? object.id : "";
    const paymentLinkId = typeof object.payment_link === "string" ? object.payment_link : "";
    if (!invoiceId || typeof amount !== "number" || !Number.isInteger(amount) || !reference || !sessionId.startsWith("cs_")) {
      return { kind: "ignore" };
    }
    const test = object.livemode !== true && root?.livemode !== true;
    return { kind: "paid", invoiceId, amountCents: amount, reference, sessionId, paymentLinkId, test };
  }
  if (type === "charge.refunded") {
    const reference = paymentIntentId(object.payment_intent);
    const amount = object.amount;
    const refunded = object.amount_refunded;
    if (!reference || typeof amount !== "number" || typeof refunded !== "number" || amount <= 0) return { kind: "ignore" };
    return {
      kind: "refund",
      invoiceId: positiveInt(asRecord(object.metadata)?.invoice_id),
      reference,
      full: refunded >= amount,
    };
  }
  return { kind: "ignore" };
}

export function labelPaymentMethod(session: unknown): string {
  const paymentIntent = asRecord(session)?.payment_intent;
  const method = asRecord(paymentIntent)?.payment_method ?? asRecord(asRecord(session)?.payment_method);
  const type = asRecord(method)?.type;
  if (type === "card") {
    const walletType = asRecord(asRecord(asRecord(method)?.card)?.wallet)?.type;
    if (walletType === "apple_pay") return "Apple Pay";
    if (walletType === "google_pay") return "Google Pay";
    if (walletType === "link") return "Link";
    return "Karte";
  }
  if (type === "paypal") return "PayPal";
  if (type === "sepa_debit") return "SEPA-Lastschrift";
  if (type === "klarna") return "Klarna";
  if (type === "link") return "Link";
  return "Online";
}

export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  nowSeconds: number,
): Promise<boolean> {
  if (!payload || !webhookSecretUsable(secret)) return false;
  const timestamp = headerValue(header, "t");
  const signatures = headerValues(header, "v1");
  const stamped = Number(timestamp);
  if (!timestamp || !Number.isFinite(stamped) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - stamped) > TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${timestamp}.${payload}`);
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}

export async function createStripePaymentLink(
  secret: string,
  input: { invoiceId: number; number: string; title: string; amountCents: number; email: string; confirmation?: string },
): Promise<{ id: string; url: string }> {
  if (!stripeSecretUsable(secret)) throw new Error("Stripe-Schlüssel fehlt");
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_AMOUNT_CENTS) {
    throw new Error("Betrag liegt unter dem Stripe-Minimum");
  }
  const price = await stripeForm(secret, "prices", stripePriceParams(input.number, input.amountCents), `invoice-${input.invoiceId}-price-v3`);
  const priceId = typeof price.id === "string" ? price.id : "";
  if (!priceId.startsWith("price_")) throw new Error("Stripe hat keinen Preis angelegt");

  const methodSets = [
    ["card", "paypal", "sepa_debit"],
    ["card", "paypal"],
    ["card", "sepa_debit"],
    ["card"],
  ];
  let lastMessage = "Zahlungslink fehlgeschlagen";
  for (const methods of methodSets) {
    const params = paymentLinkParams(input, priceId, methods, stripeKeyMode(secret) === "test");
    let result = await stripePost(secret, "payment_links", params, `invoice-${input.invoiceId}-link-stmt1-${methods.join("-")}`);
    if (!result.ok && canDropDescriptor(result.body)) {
      result = await stripePost(
        secret,
        "payment_links",
        paymentLinkParams(input, priceId, methods, stripeKeyMode(secret) === "test", true, false),
        `invoice-${input.invoiceId}-link-stmt1b-${methods.join("-")}`,
      );
    }
    if (!result.ok && canDropIntent(result.body)) {
      result = await stripePost(
        secret,
        "payment_links",
        paymentLinkParams(input, priceId, methods, stripeKeyMode(secret) === "test", false, false),
        `invoice-${input.invoiceId}-link-stmt1c-${methods.join("-")}`,
      );
    }
    if (result.ok) {
      const id = typeof asRecord(result.body)?.id === "string" ? String(asRecord(result.body)?.id) : "";
      const url = typeof asRecord(result.body)?.url === "string" ? String(asRecord(result.body)?.url) : "";
      if (id.startsWith("plink_") && url.startsWith("https://")) return { id, url };
      throw new Error("Stripe-Antwort ohne Zahlungslink");
    }
    lastMessage = stripeErrorMessage(result.body);
    if (result.status === 401 || result.status === 403 || !canDropMethod(result.body)) break;
  }
  throw new Error(lastMessage);
}

export async function setStripePaymentLinkActive(secret: string, linkId: string, active: boolean): Promise<void> {
  if (!stripeSecretUsable(secret) || !/^plink_[A-Za-z0-9]+$/.test(linkId)) return;
  const result = await stripePost(secret, `payment_links/${linkId}`, new URLSearchParams({ active: active ? "true" : "false" }));
  if (!result.ok) throw new Error(stripeErrorMessage(result.body));
}

export async function readCheckoutPaymentMethod(secret: string, sessionId: string): Promise<string> {
  if (!stripeSecretUsable(secret) || !/^cs_[A-Za-z0-9]+$/.test(sessionId)) return "Online";
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=${encodeURIComponent("payment_intent.payment_method")}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  if (!response.ok) return "Online";
  const body: unknown = await response.json().catch(() => null);
  return labelPaymentMethod(body);
}

export function stripePriceParams(number: string, amountCents: number): URLSearchParams {
  return new URLSearchParams({
    currency: "eur",
    unit_amount: String(amountCents),
    "product_data[name]": `Rechnung ${number}`.slice(0, 250),
    "product_data[description]": `Rechnungsnummer ${number}`.slice(0, 500),
  });
}

/** Text für die Kontoabbuchung (Stripe statement_descriptor_suffix, max. 22 Zeichen). */
export function stripeStatementSuffix(number: string): string {
  const cleaned = number
    .toUpperCase()
    .replace(/[^A-Z0-9*.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const withLetter = /[A-Z]/.test(cleaned) ? cleaned : `R ${cleaned}`.trim();
  return withLetter.slice(0, 22);
}

export function paymentLinkParams(
  input: { invoiceId: number; number: string; email: string; confirmation?: string },
  priceId: string,
  methods: string[],
  testMode: boolean,
  withIntent = true,
  withStatement = true,
): URLSearchParams {
  const params = new URLSearchParams({
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "metadata[invoice_id]": String(input.invoiceId),
    "metadata[invoice_number]": input.number,
    "after_completion[type]": "hosted_confirmation",
    "after_completion[hosted_confirmation][custom_message]": input.confirmation?.trim()
      || (testMode
        ? "Testmodus: Es wird kein Geld abgebucht."
        : "Vielen Dank. Die Zahlung ist eingegangen und die Rechnung gilt als bezahlt."),
    inactive_message: "Diese Rechnung ist bereits bezahlt.",
    "automatic_tax[enabled]": "false",
    submit_type: "pay",
  });
  if (withIntent) {
    const label = `Rechnung ${input.number}`.slice(0, 500);
    params.set("payment_intent_data[description]", label);
    params.set("payment_intent_data[metadata][invoice_id]", String(input.invoiceId));
    params.set("payment_intent_data[metadata][invoice_number]", input.number);
    if (withStatement) {
      const suffix = stripeStatementSuffix(input.number);
      if (suffix) params.set("payment_intent_data[statement_descriptor_suffix]", suffix);
    }
  }
  if (!testMode) params.set("restrictions[completed_sessions][limit]", "1");
  methods.forEach((method, index) => params.append(`payment_method_types[${index}]`, method));
  return params;
}

function canDropIntent(body: unknown): boolean {
  const error = asRecord(asRecord(body)?.error);
  const code = error?.code;
  const param = typeof error?.param === "string" ? error.param : "";
  if (code === "parameter_unknown" && param.includes("payment_intent")) return true;
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  return message.includes("payment_intent");
}

function canDropDescriptor(body: unknown): boolean {
  const error = asRecord(asRecord(body)?.error);
  const param = typeof error?.param === "string" ? error.param : "";
  if (param.includes("statement_descriptor")) return true;
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  return message.includes("statement_descriptor");
}

async function stripeForm(
  secret: string,
  path: string,
  params: URLSearchParams,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const result = await stripePost(secret, path, params, idempotencyKey);
  if (!result.ok) throw new Error(stripeErrorMessage(result.body));
  return asRecord(result.body) ?? {};
}

async function stripePost(
  secret: string,
  path: string,
  params: URLSearchParams,
  idempotencyKey?: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers, body: params });
  const body: unknown = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

function stripeSecretUsable(secret: string | undefined): boolean {
  const value = secret?.trim() ?? "";
  return value.startsWith("sk_") || value.startsWith("rk_");
}

function webhookSecretUsable(secret: string | undefined): boolean {
  return (secret?.trim() ?? "").startsWith("whsec_");
}

function canDropMethod(body: unknown): boolean {
  const error = asRecord(asRecord(body)?.error);
  const code = error?.code;
  const param = error?.param;
  if (code === "payment_method_unactivated") return true;
  if (typeof param === "string" && param.includes("payment_method_types")) return true;
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  return message.includes("payment method") || message.includes("paypal") || message.includes("sepa");
}

function stripeErrorMessage(body: unknown): string {
  const message = asRecord(asRecord(body)?.error)?.message;
  return typeof message === "string" && message.trim() ? message.trim().slice(0, 300) : "Stripe-Anfrage fehlgeschlagen";
}

function positiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function paymentIntentId(value: unknown): string {
  if (typeof value === "string" && value.startsWith("pi_")) return value;
  const id = asRecord(value)?.id;
  return typeof id === "string" && id.startsWith("pi_") ? id : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function headerValue(header: string, key: string): string {
  return headerValues(header, key)[0] ?? "";
}

function headerValues(header: string, key: string): string[] {
  const values: string[] = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === key) values.push(part.slice(index + 1).trim());
  }
  return values;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}
