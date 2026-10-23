import { openAmountCents } from "./billing";
import { invoiceNumber } from "./invoice";
import {
  getInvoice,
  noteInvoicePayment,
  saveInvoicePaymentLink,
  sumCreditsForInvoice,
  type InvoiceRow,
} from "./invoices";
import {
  createStripePaymentLink,
  paymentLinkForMail,
  setStripePaymentLinkActive,
  stripePaymentsReady,
} from "./stripe-pay";

/** Zahlungslink anlegen oder vorhandenen für Mail/Portal aufbereiten. */
export async function ensureInvoicePaymentUrl(
  env: Env,
  db: D1Database,
  row: InvoiceRow,
): Promise<string | null> {
  if (
    row.document_kind === "storno" ||
    row.document_kind === "gutschrift" ||
    row.payment_status === "bezahlt" ||
    row.payment_status === "erstattet" ||
    row.payment_status === "storniert"
  ) {
    return null;
  }
  const credited = await sumCreditsForInvoice(db, row.id);
  const amountCents = openAmountCents(row, credited);
  const number = invoiceNumber(row.id, row.invoice_date);
  if (!stripePaymentsReady(env) || !env.STRIPE_SECRET_KEY || amountCents < 50) {
    return row.payment_url ? paymentLinkForMail(row.payment_url, row.buyer_email) || null : null;
  }
  try {
    const previousLinkId = row.payment_link_id;
    const link = await createStripePaymentLink(env.STRIPE_SECRET_KEY, {
      invoiceId: row.id,
      number,
      title: row.title,
      amountCents,
      email: row.buyer_email,
    });
    await saveInvoicePaymentLink(db, row.id, link.url, link.id, true);
    if (previousLinkId && previousLinkId !== link.id) {
      try {
        await setStripePaymentLinkActive(env.STRIPE_SECRET_KEY, previousLinkId, false);
      } catch (err) {
        console.error("invoice_payment_link_close_failed", err instanceof Error ? err.message : "error");
      }
    }
    if (row.payment_note?.includes("Zahlungslink")) {
      await noteInvoicePayment(db, row.id, "");
    }
    return paymentLinkForMail(link.url, row.buyer_email) || null;
  } catch (err) {
    console.error("invoice_payment_link_failed", err instanceof Error ? err.message : "error");
    if (!row.payment_note) {
      await noteInvoicePayment(db, row.id, "Der Zahlungslink konnte nicht angelegt werden. Bitte erneut senden.");
    }
    if (row.payment_url) return paymentLinkForMail(row.payment_url, row.buyer_email) || null;
    return null;
  }
}

export async function ensureInvoicePaymentUrlById(
  env: Env,
  db: D1Database,
  invoiceId: number,
): Promise<string | null> {
  const row = await getInvoice(db, invoiceId);
  if (!row) return null;
  return ensureInvoicePaymentUrl(env, db, row);
}
