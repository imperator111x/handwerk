import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { cfEnv } from "../../../lib/cf";
import { getCustomer } from "../../../lib/customers";
import { getDb, signatureNameForUser } from "../../../lib/db";
import { decodeHtmlEntities } from "../../../lib/html-entities";
import { invoiceNumber, parseInvoiceForm } from "../../../lib/invoice";
import { buildInvoicePdf } from "../../../lib/invoice-pdf";
import {
  clearTransferPayment,
  getInvoice,
  getTaxNumber,
  noteInvoicePayment,
  recordTransferPayment,
  renderInvoicePdf,
  saveInvoice,
  saveInvoicePaymentLink,
  sendInvoiceEmail,
  updateInvoiceDelivery,
  type InvoiceRow,
} from "../../../lib/invoices";
import { createStripePaymentLink, paymentLinkForMail, setStripePaymentLinkActive, stripePaymentsReady } from "../../../lib/stripe-pay";
import { berlinTodayIso, getQuote } from "../../../lib/offers";
import { formatOfferDate, readStoredOffer } from "../../../lib/quote";
import { greetingFromForm } from "../../../lib/salutation";

export const prerender = false;

function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const env = cfEnv();
  const form = await ctx.request.formData();
  const action = String(form.get("action") ?? "");
  if (!db || !env) return ctx.redirect("/admin/rechnungen?rechnung=db", 303);

  if (action === "resend" || action === "transfer" || action === "transfer-clear") {
    const id = Number.parseInt(String(form.get("id") ?? ""), 10);
    const row = Number.isFinite(id) ? await getInvoice(db, id) : null;
    if (!row) return ctx.redirect("/admin/rechnungen?rechnung=missing", 303);
    if (action === "transfer") {
      const paidAt = Math.floor(Date.now() / 1000);
      const result = await recordTransferPayment(db, row.id, paidAt);
      if (result === "paid" && row.payment_link_id && env.STRIPE_SECRET_KEY) {
        try {
          await setStripePaymentLinkActive(env.STRIPE_SECRET_KEY, row.payment_link_id, false);
        } catch (err) {
          console.error("invoice_payment_link_close_failed", err instanceof Error ? err.message : "error");
          await noteInvoicePayment(db, row.id, "Der Zahlungslink ließ sich nicht schließen.");
        }
      }
      return ctx.redirect(`/admin/rechnungen/${row.id}?rechnung=${result === "paid" ? "transfer" : "transfer-kept"}`, 303);
    }
    if (action === "transfer-clear") {
      const cleared = await clearTransferPayment(db, row.id);
      if (cleared && row.payment_link_id && env.STRIPE_SECRET_KEY) {
        try {
          await setStripePaymentLinkActive(env.STRIPE_SECRET_KEY, row.payment_link_id, true);
        } catch (err) {
          console.error("invoice_payment_link_open_failed", err instanceof Error ? err.message : "error");
        }
      }
      return ctx.redirect(`/admin/rechnungen/${row.id}?rechnung=${cleared ? "transfer-clear" : "transfer-kept"}`, 303);
    }
    const stored = readStoredOffer(row.lines_json, "");
    const authorName = await signatureNameForUser(db, session.userId, session.username);
    const pdf = renderInvoicePdf(row, stored, authorName);
    const number = invoiceNumber(row.id, row.invoice_date);
    const paymentUrl = await ensurePaymentUrl(env, db, row, number);
    const delivery = await sendInvoiceEmail(env, {
      to: row.buyer_email,
      recipientName: row.buyer_name,
      authorName,
      greeting: stored.greeting,
      invoice: {
        title: row.title,
        intro: stored.intro,
        lines: stored.lines,
        invoiceDate: row.invoice_date,
        serviceDate: row.service_date,
        dueDate: row.due_date,
        priceCents: row.price_cents,
      },
      taxNumber: row.tax_number,
      filename: pdf.filename,
      pdf: pdf.bytes,
      number,
      paymentUrl,
      paymentStatus: row.payment_status,
    });
    await updateInvoiceDelivery(db, row.id, delivery.sentAt, delivery.emailStatus);
    const flag = delivery.sentAt ? "sent" : "failed";
    return ctx.redirect(`/admin/rechnungen/${row.id}?rechnung=${flag}`, 303);
  }

  const customerId = Number.parseInt(String(form.get("customer_id") ?? ""), 10);
  const quoteId = Number.parseInt(String(form.get("quote_id") ?? ""), 10);
  const back = Number.isFinite(customerId) && customerId > 0 ? `/admin/rechnungen/neu?kunde=${customerId}` : "/admin/rechnungen/neu";
  const customer = Number.isFinite(customerId) ? await getCustomer(db, customerId) : null;
  if (!customer) return ctx.redirect("/admin/rechnungen/neu?rechnung=missing", 303);
  const taxNumber = await getTaxNumber(db);
  if (!taxNumber) return ctx.redirect(`${back}&rechnung=tax`, 303);
  const street = customer.street?.trim() ?? "";
  const postalCode = customer.postal_code?.trim() ?? "";
  const city = customer.city?.trim() ?? "";
  if (!street || !postalCode || !city) return ctx.redirect(`${back}&rechnung=address`, 303);

  const invoice = parseInvoiceForm(form, berlinTodayIso());
  if (!invoice) return ctx.redirect(`${back}&rechnung=bad`, 303);
  const authorName = await signatureNameForUser(db, session.userId, session.username);
  const buyerName = decodeHtmlEntities(customer.name);
  const greeting = greetingFromForm(form, buyerName);
  const linkedQuote = Number.isFinite(quoteId) && quoteId > 0 ? await getQuote(db, quoteId) : null;

  if (String(form.get("preview") ?? "") === "1") {
    const bytes = buildInvoicePdf({
      number: "Entwurf",
      invoiceDateLabel: formatOfferDate(invoice.invoiceDate),
      serviceDateLabel: formatOfferDate(invoice.serviceDate),
      dueDateLabel: formatOfferDate(invoice.dueDate),
      taxNumber,
      buyerName,
      buyerEmail: customer.email,
      buyerPhone: customer.phone,
      buyerStreet: street,
      buyerPostalCode: postalCode,
      buyerCity: city,
      title: invoice.title,
      greeting,
      intro: invoice.intro,
      lines: invoice.lines,
      invoiceDate: invoice.invoiceDate,
      serviceDate: invoice.serviceDate,
      dueDate: invoice.dueDate,
      authorName,
    });
    return pdfResponse(bytes, "Rechnung-Entwurf.pdf");
  }

  const createdAt = Math.floor(Date.now() / 1000);
  const id = await saveInvoice(db, {
    customerId: customer.id,
    quoteId: linkedQuote?.id ?? null,
    invoice,
    greeting,
    taxNumber,
    buyer: {
      name: buyerName,
      email: customer.email,
      phone: customer.phone,
      street,
      postalCode,
      city,
    },
    createdAt,
  });
  if (!id) return ctx.redirect(`${back}&rechnung=db`, 303);
  const number = invoiceNumber(id, invoice.invoiceDate);
  const row = await getInvoice(db, id);
  if (!row) return ctx.redirect(`${back}&rechnung=db`, 303);
  const stored = readStoredOffer(row.lines_json, invoice.intro);
  const pdf = renderInvoicePdf(row, stored, authorName);
  const paymentUrl = await ensurePaymentUrl(env, db, row, number);
  const delivery = await sendInvoiceEmail(env, {
    to: customer.email,
    recipientName: buyerName,
    authorName,
    greeting,
    invoice,
    taxNumber,
    filename: pdf.filename,
    pdf: pdf.bytes,
    number,
    paymentUrl,
    paymentStatus: row.payment_status,
  });
  await updateInvoiceDelivery(db, id, delivery.sentAt, delivery.emailStatus);
  const flag = delivery.sentAt ? "sent" : "saved";
  return ctx.redirect(`/admin/rechnungen/${id}?rechnung=${flag}`, 303);
}

async function ensurePaymentUrl(env: Env, db: D1Database, row: InvoiceRow, number: string): Promise<string | null> {
  if (row.payment_status === "bezahlt" || row.payment_status === "erstattet") return null;
  if (row.payment_url) return paymentLinkForMail(row.payment_url, row.buyer_email) || null;
  if (!stripePaymentsReady(env) || !env.STRIPE_SECRET_KEY || row.price_cents < 50) return null;
  try {
    const link = await createStripePaymentLink(env.STRIPE_SECRET_KEY, {
      invoiceId: row.id,
      number,
      title: row.title,
      amountCents: row.price_cents,
      email: row.buyer_email,
    });
    await saveInvoicePaymentLink(db, row.id, link.url, link.id);
    return paymentLinkForMail(link.url, row.buyer_email) || null;
  } catch (err) {
    console.error("invoice_payment_link_failed", err instanceof Error ? err.message : "error");
    return null;
  }
}
