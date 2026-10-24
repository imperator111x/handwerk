import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { cfEnv } from "../../../lib/cf";
import { getCustomer } from "../../../lib/customers";
import { getDb, signatureNameForUser } from "../../../lib/db";
import { decodeHtmlEntities } from "../../../lib/html-entities";
import { invoiceNumber, parseInvoiceForm } from "../../../lib/invoice";
import { buildInvoicePdf } from "../../../lib/invoice-pdf";
import {
  beginStorno,
  clearTransferPayment,
  getInvoice,
  getTaxNumber,
  noteInvoicePayment,
  recordTransferPayment,
  relatedInvoice,
  renderInvoicePdf,
  saveInvoice,
  saveInvoicePaymentLink,
  sendInvoiceEmail,
  updateInvoiceDelivery,
  type InvoiceRow,
} from "../../../lib/invoices";
import { createStripePaymentLink, paymentLinkForMail, setStripePaymentLinkActive, stripeKeyMode, stripePaymentsReady } from "../../../lib/stripe-pay";
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

  if (action === "resend" || action === "transfer" || action === "transfer-clear" || action === "storno" || action === "adjust") {
    const id = Number.parseInt(String(form.get("id") ?? ""), 10);
    const row = Number.isFinite(id) ? await getInvoice(db, id) : null;
    if (!row) return ctx.redirect("/admin/rechnungen?rechnung=missing", 303);
    if (action === "storno" || action === "adjust") {
      return handleCorrection(ctx, env, db, session.userId, session.username, row, form, action);
    }
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
    const authorName = await signatureNameForUser(db, session.userId, session.username);
    const sent = await deliverInvoice(env, db, row, authorName, "rechnung");
    const flag = sent.sent ? (sent.paymentUrl ? "sent" : "sent-ohne-link") : "failed";
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
  const row = await getInvoice(db, id);
  if (!row) return ctx.redirect(`${back}&rechnung=db`, 303);
  const sent = await deliverInvoice(env, db, row, authorName, "rechnung");
  return ctx.redirect(`/admin/rechnungen/${id}?rechnung=${sent.sent ? (sent.paymentUrl ? "sent" : "sent-ohne-link") : "saved"}`, 303);
}

async function ensurePaymentUrl(env: Env, db: D1Database, row: InvoiceRow, number: string): Promise<string | null> {
  if (row.document_kind === "storno" || row.payment_status === "bezahlt" || row.payment_status === "erstattet" || row.payment_status === "storniert") {
    return null;
  }
  const mode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  const replaceTestLink = Boolean(row.payment_url?.includes("/test_")) && mode === "live";
  if (row.payment_url && !replaceTestLink) return paymentLinkForMail(row.payment_url, row.buyer_email) || null;
  if (!stripePaymentsReady(env) || !env.STRIPE_SECRET_KEY || row.price_cents < 50) return null;
  try {
    const link = await createStripePaymentLink(env.STRIPE_SECRET_KEY, {
      invoiceId: row.id,
      number,
      title: row.title,
      amountCents: row.price_cents,
      email: row.buyer_email,
    });
    await saveInvoicePaymentLink(db, row.id, link.url, link.id, replaceTestLink);
    return paymentLinkForMail(link.url, row.buyer_email) || null;
  } catch (err) {
    console.error("invoice_payment_link_failed", err instanceof Error ? err.message : "error");
    if (!row.payment_note) {
      await noteInvoicePayment(db, row.id, "Der Zahlungslink konnte nicht angelegt werden. Bitte erneut senden.");
    }
    return null;
  }
}

async function deliverInvoice(
  env: NonNullable<ReturnType<typeof cfEnv>>,
  db: D1Database,
  row: InvoiceRow,
  authorName: string,
  purpose: "rechnung" | "storno",
): Promise<{ sent: boolean; paymentUrl: boolean }> {
  const stored = readStoredOffer(row.lines_json, "");
  const pdf = renderInvoicePdf(row, stored, authorName, await relatedInvoice(db, row));
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
    paymentMode: stripeKeyMode(env.STRIPE_SECRET_KEY),
    purpose,
  });
  await updateInvoiceDelivery(db, row.id, delivery.sentAt, delivery.emailStatus);
  const linkExpected = purpose === "rechnung" && row.payment_status !== "bezahlt" && row.payment_status !== "erstattet" && row.payment_status !== "storniert";
  return { sent: delivery.sentAt != null, paymentUrl: !linkExpected || Boolean(paymentUrl) };
}

async function closePaymentLink(env: NonNullable<ReturnType<typeof cfEnv>>, row: InvoiceRow): Promise<void> {
  if (!row.payment_link_id || !env.STRIPE_SECRET_KEY) return;
  try {
    await setStripePaymentLinkActive(env.STRIPE_SECRET_KEY, row.payment_link_id, false);
  } catch (err) {
    console.error("invoice_payment_link_close_failed", err instanceof Error ? err.message : "error");
  }
}

async function handleCorrection(
  ctx: APIContext,
  env: NonNullable<ReturnType<typeof cfEnv>>,
  db: D1Database,
  userId: number | undefined,
  username: string,
  row: InvoiceRow,
  form: FormData,
  action: "storno" | "adjust",
): Promise<Response> {
  const back = `/admin/rechnungen/${row.id}`;
  if (row.document_kind === "storno" || row.payment_status === "storniert") {
    return ctx.redirect(`${back}?rechnung=storno-kept`, 303);
  }
  const today = berlinTodayIso();
  const authorName = await signatureNameForUser(db, userId, username);
  if (action === "adjust" && String(form.get("preview") ?? "") === "1") {
    const invoice = parseInvoiceForm(form, today);
    if (!invoice) return ctx.redirect(`/admin/rechnungen/bearbeiten?id=${row.id}&rechnung=bad`, 303);
    const greeting = greetingFromForm(form, row.buyer_name);
    const bytes = buildInvoicePdf({
      number: "Entwurf",
      invoiceDateLabel: formatOfferDate(invoice.invoiceDate),
      serviceDateLabel: formatOfferDate(invoice.serviceDate),
      dueDateLabel: formatOfferDate(invoice.dueDate),
      taxNumber: (await getTaxNumber(db)) || row.tax_number,
      buyerName: row.buyer_name,
      buyerEmail: row.buyer_email,
      buyerPhone: row.buyer_phone,
      buyerStreet: row.buyer_street,
      buyerPostalCode: row.buyer_postal_code,
      buyerCity: row.buyer_city,
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
  const replacement = action === "adjust" ? parseInvoiceForm(form, today) : null;
  if (action === "adjust" && !replacement) return ctx.redirect(`/admin/rechnungen/bearbeiten?id=${row.id}&rechnung=bad`, 303);
  const stornoId = await beginStorno(db, row, today, Math.floor(Date.now() / 1000));
  if (!stornoId) return ctx.redirect(`${back}?rechnung=storno-kept`, 303);
  await closePaymentLink(env, row);
  const storno = await getInvoice(db, stornoId);
  if (storno) await deliverInvoice(env, db, storno, authorName, "storno");
  if (!replacement) return ctx.redirect(`${back}?rechnung=storniert`, 303);
  const createdAt = Math.floor(Date.now() / 1000);
  const newId = await saveInvoice(db, {
    customerId: row.customer_id,
    quoteId: row.quote_id,
    invoice: replacement,
    greeting: greetingFromForm(form, row.buyer_name),
    taxNumber: (await getTaxNumber(db)) || row.tax_number,
    buyer: {
      name: row.buyer_name,
      email: row.buyer_email,
      phone: row.buyer_phone,
      street: row.buyer_street,
      postalCode: row.buyer_postal_code,
      city: row.buyer_city,
    },
    createdAt,
    relatedInvoiceId: row.id,
  });
  if (!newId) return ctx.redirect(`${back}?rechnung=storniert`, 303);
  const created = await getInvoice(db, newId);
  if (!created) return ctx.redirect(`${back}?rechnung=storniert`, 303);
  const paidNote = row.payment_method ? `Die Zahlung per ${row.payment_method} bleibt vermerkt. ` : "";
  await noteInvoicePayment(
    db,
    row.id,
    `${paidNote}Aufgehoben durch Stornorechnung ${invoiceNumber(stornoId, today)}. Neue Rechnung ${invoiceNumber(newId, replacement.invoiceDate)}.`,
  );
  const sent = await deliverInvoice(env, db, created, authorName, "rechnung");
  const flag = sent.sent ? (sent.paymentUrl ? "angepasst" : "angepasst-ohne-link") : "angepasst-offen";
  return ctx.redirect(`/admin/rechnungen/${newId}?rechnung=${flag}`, 303);
}
