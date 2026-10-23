import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getCustomer } from "../../../lib/customers";
import { getDb, signatureNameForUser } from "../../../lib/db";
import { decodeHtmlEntities } from "../../../lib/html-entities";
import { INVOICE_DEFAULT_INTRO, invoiceFromQuoteLines } from "../../../lib/invoice";
import { buildInvoicePdf } from "../../../lib/invoice-pdf";
import { getTaxNumber } from "../../../lib/invoices";
import { berlinTodayIso, getQuote } from "../../../lib/offers";
import { formatOfferDate, readStoredOffer } from "../../../lib/quote";

export const prerender = false;

export async function GET(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const quoteId = Number.parseInt(ctx.url.searchParams.get("id") ?? "", 10);
  if (!db || !Number.isFinite(quoteId) || quoteId <= 0) {
    return new Response("Nicht gefunden", { status: 404 });
  }
  const quote = await getQuote(db, quoteId);
  if (!quote?.customer_id) return new Response("Nicht gefunden", { status: 404 });
  const customer = await getCustomer(db, quote.customer_id);
  if (!customer) return new Response("Nicht gefunden", { status: 404 });
  const taxNumber = await getTaxNumber(db);
  if (!taxNumber) return new Response("Steuernummer fehlt", { status: 400 });
  const street = customer.street?.trim() ?? "";
  const postalCode = customer.postal_code?.trim() ?? "";
  const city = customer.city?.trim() ?? "";
  if (!street || !postalCode || !city) return new Response("Kundenadresse fehlt", { status: 400 });

  const stored = readStoredOffer(quote.lines_json, "");
  const today = berlinTodayIso();
  const invoice = invoiceFromQuoteLines({
    title: quote.title,
    intro: stored.intro || INVOICE_DEFAULT_INTRO,
    lines: stored.lines,
    today,
    dueDays: Number(customer.default_due_days ?? 14),
    billingKind: "voll",
  });
  if (!invoice) return new Response("Rechnung ungültig", { status: 400 });

  const authorName = await signatureNameForUser(db, session.userId, session.username);
  const buyerName = decodeHtmlEntities(customer.name);
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
    siteName: customer.site_name,
    siteStreet: customer.site_street,
    sitePostalCode: customer.site_postal_code,
    siteCity: customer.site_city,
    paymentTerms: invoice.paymentTerms,
    billingKind: invoice.billingKind,
    title: invoice.title,
    greeting: stored.greeting,
    intro: invoice.intro,
    lines: invoice.lines,
    invoiceDate: invoice.invoiceDate,
    serviceDate: invoice.serviceDate,
    dueDate: invoice.dueDate,
    authorName,
  });

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Rechnung-Entwurf.pdf"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
