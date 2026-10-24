import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "./email";
import { decodeHtmlEntities } from "./html-entities";
import { buildOfferPdf, type OfferPdfInput } from "./offer-pdf";
import {
  formatBerlinDate,
  formatEuro,
  formatOfferDate,
  offerNumber,
  offerPlainText,
  parseOfferForm,
  readStoredOffer,
  serializeOffer,
  type ParsedOffer,
} from "./quote";

export interface QuoteRow {
  id: number;
  request_id: number | null;
  customer_id: number | null;
  title: string;
  body: string;
  price_cents: number;
  valid_until: string;
  created_at: number;
  sent_at: number | null;
  email_status: string | null;
  lines_json: string;
}

export interface OfferParty {
  name: string;
  email: string;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
}

export function berlinTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function cleanOffer(
  form: FormData,
  today = berlinTodayIso(),
  options?: { allowPast?: boolean },
): ParsedOffer | null {
  return parseOfferForm(form, today, options);
}

export interface QuoteListItem extends QuoteRow {
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
}

export type OfferValidity = "gueltig" | "abgelaufen";

export function offerValidity(validUntil: string, today: string): OfferValidity {
  return validUntil >= today ? "gueltig" : "abgelaufen";
}

export async function listQuotes(db: D1Database, requestId: number): Promise<QuoteRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, request_id, customer_id, title, body, price_cents, valid_until, created_at, sent_at, email_status, lines_json
         FROM quotes WHERE request_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .bind(requestId)
    .all<QuoteRow>();
  return results ?? [];
}

export async function listAllQuotes(db: D1Database): Promise<QuoteListItem[]> {
  const { results } = await db
    .prepare(
      `SELECT q.id, q.request_id, q.customer_id, q.title, q.body, q.price_cents, q.valid_until, q.created_at,
              q.sent_at, q.email_status, q.lines_json,
              COALESCE(cu.name, c.name, '') AS customer_name,
              COALESCE(cu.email, c.email, '') AS customer_email,
              COALESCE(cu.phone, c.phone) AS customer_phone
         FROM quotes q
         LEFT JOIN customers cu ON cu.id = q.customer_id
         LEFT JOIN contact_requests c ON c.id = q.request_id
        ORDER BY q.created_at DESC, q.id DESC`,
    )
    .all<QuoteListItem>();
  return results ?? [];
}

export async function getQuote(db: D1Database, id: number): Promise<QuoteRow | null> {
  return await db
    .prepare(
      `SELECT id, request_id, customer_id, title, body, price_cents, valid_until, created_at, sent_at, email_status, lines_json
         FROM quotes WHERE id = ?`,
    )
    .bind(id)
    .first<QuoteRow>();
}

export async function listQuotesForCustomer(db: D1Database, customerId: number): Promise<QuoteRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, request_id, customer_id, title, body, price_cents, valid_until, created_at, sent_at, email_status, lines_json
         FROM quotes WHERE customer_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .bind(customerId)
    .all<QuoteRow>();
  return results ?? [];
}

export async function saveQuote(
  db: D1Database,
  link: { requestId?: number | null; customerId?: number | null },
  offer: ParsedOffer,
  greeting: string | null,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO quotes (request_id, customer_id, title, body, price_cents, valid_until, sent_at, email_status, lines_json)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'pending', ?)`,
    )
    .bind(
      link.requestId ?? null,
      link.customerId ?? null,
      offer.title,
      offer.intro,
      offer.priceCents,
      offer.validUntil,
      serializeOffer({ greeting, intro: offer.intro, lines: offer.lines, billing: offer.billing }),
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function quoteParty(db: D1Database, quote: QuoteRow): Promise<OfferParty | null> {
  if (quote.customer_id) {
    const customer = await db
      .prepare(
        `SELECT name, email, phone, street, postal_code, city FROM customers WHERE id = ?`,
      )
      .bind(quote.customer_id)
      .first<{
        name: string;
        email: string;
        phone: string | null;
        street: string | null;
        postal_code: string | null;
        city: string | null;
      }>();
    if (customer) {
      return {
        name: decodeHtmlEntities(customer.name),
        email: customer.email,
        phone: customer.phone,
        street: customer.street,
        postalCode: customer.postal_code,
        city: customer.city,
      };
    }
  }
  if (quote.request_id) {
    const request = await db
      .prepare(`SELECT name, email, phone FROM contact_requests WHERE id = ?`)
      .bind(quote.request_id)
      .first<{ name: string; email: string; phone: string | null }>();
    if (request) {
      return {
        name: decodeHtmlEntities(request.name),
        email: request.email,
        phone: request.phone,
        street: null,
        postalCode: null,
        city: null,
      };
    }
  }
  return null;
}

export async function updateQuote(
  db: D1Database,
  id: number,
  offer: ParsedOffer,
  greeting: string | null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE quotes
          SET title = ?, body = ?, price_cents = ?, valid_until = ?, lines_json = ?
        WHERE id = ?`,
    )
    .bind(
      offer.title,
      offer.intro,
      offer.priceCents,
      offer.validUntil,
      serializeOffer({ greeting, intro: offer.intro, lines: offer.lines, billing: offer.billing }),
      id,
    )
    .run();
}

export async function deleteQuote(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM quotes WHERE id = ?`).bind(id).run();
}

export async function updateQuoteDelivery(
  db: D1Database,
  id: number,
  delivery: { sentAt: number | null; emailStatus: string },
): Promise<void> {
  await db
    .prepare(`UPDATE quotes SET sent_at = ?, email_status = ? WHERE id = ?`)
    .bind(delivery.sentAt, delivery.emailStatus, id)
    .run();
}

export function offerPdfForQuote(
  quote: QuoteRow,
  customer: {
    name: string;
    email: string;
    phone?: string | null;
    street?: string | null;
    postalCode?: string | null;
    city?: string | null;
  },
  authorName: string,
): { filename: string; bytes: Uint8Array } {
  const stored = readStoredOffer(quote.lines_json, quote.body);
  const lines = stored.lines.length
    ? stored.lines
    : [{ label: quote.title, quantity: 1, unit: "pauschal" as const, unitCents: quote.price_cents }];
  const number = offerNumber(quote.id, quote.created_at);
  const input: OfferPdfInput = {
    number,
    dateLabel: formatBerlinDate(quote.created_at),
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
    customerStreet: customer.street,
    customerPostalCode: customer.postalCode,
    customerCity: customer.city,
    title: quote.title,
    greeting: stored.greeting,
    intro: stored.intro,
    lines,
    validUntilLabel: formatOfferDate(quote.valid_until),
    authorName,
    billing: stored.billing,
  };
  return { filename: `Angebot-${number}.pdf`, bytes: buildOfferPdf(input) };
}

export async function sendOfferEmail(
  env: Env,
  input: {
    to: string;
    recipientName: string;
    authorName: string;
    greeting?: string | null;
    phone?: string | null;
    offer: ParsedOffer;
    filename: string;
    pdf: Uint8Array;
    number: string;
  },
): Promise<{ sentAt: number | null; emailStatus: string }> {
  const plain = offerPlainText({
    number: input.number,
    title: input.offer.title,
    intro: input.offer.intro,
    lines: input.offer.lines,
    validUntil: input.offer.validUntil,
    billing: input.offer.billing,
  });
  const subject = `Angebot ${input.number}: ${input.offer.title}`;
  const from = "info@zeus-service.de";
  const footerNote = `Gültig bis ${formatOfferDate(input.offer.validUntil)}. Sie können direkt auf diese E-Mail antworten.`;
  const result = await sendEmail(env, {
    from: env.CONTACT_FROM_EMAIL ?? "website@zeus-service.de",
    fromName: env.SITE_NAME ?? "Zeus-Service",
    to: input.to,
    replyTo: from,
    subject,
    html: renderReplyEmailHtml({
      siteName: env.SITE_NAME ?? "Zeus-Service",
      siteUrl: env.SITE_URL ?? "https://zeus-service.de",
      recipientName: input.recipientName,
      subject,
      bodyText: plain,
      authorName: input.authorName,
      fromEmail: from,
      replyToEmail: from,
      eyebrow: "Angebot",
      greeting: input.greeting,
      footerNote,
    }),
    text: renderReplyEmailText({
      siteName: env.SITE_NAME ?? "Zeus-Service",
      siteUrl: env.SITE_URL ?? "https://zeus-service.de",
      recipientName: input.recipientName,
      subject,
      bodyText: plain,
      authorName: input.authorName,
      fromEmail: from,
      replyToEmail: from,
      greeting: input.greeting,
      footerNote,
    }),
    attachments: [
      {
        filename: input.filename,
        type: "application/pdf",
        disposition: "attachment",
        content: input.pdf,
      },
    ],
  });
  if (result.ok) {
    return { sentAt: Math.floor(Date.now() / 1000), emailStatus: `sent:${result.via}` };
  }
  return { sentAt: null, emailStatus: result.via === "none" ? "skipped:no_transport" : `failed:${result.via}` };
}

export { formatEuro };
