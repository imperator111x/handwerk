import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "./email";
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
  request_id: number;
  title: string;
  body: string;
  price_cents: number;
  valid_until: string;
  created_at: number;
  sent_at: number | null;
  email_status: string | null;
  lines_json: string;
}

export function berlinTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function cleanOffer(form: FormData, today = berlinTodayIso()): ParsedOffer | null {
  return parseOfferForm(form, today);
}

export async function listQuotes(db: D1Database, requestId: number): Promise<QuoteRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, request_id, title, body, price_cents, valid_until, created_at, sent_at, email_status, lines_json
         FROM quotes WHERE request_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .bind(requestId)
    .all<QuoteRow>();
  return results ?? [];
}

export async function getQuote(db: D1Database, id: number): Promise<QuoteRow | null> {
  return await db
    .prepare(
      `SELECT id, request_id, title, body, price_cents, valid_until, created_at, sent_at, email_status, lines_json
         FROM quotes WHERE id = ?`,
    )
    .bind(id)
    .first<QuoteRow>();
}

export async function saveQuote(
  db: D1Database,
  requestId: number,
  offer: ParsedOffer,
  greeting: string | null,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO quotes (request_id, title, body, price_cents, valid_until, sent_at, email_status, lines_json)
       VALUES (?, ?, ?, ?, ?, NULL, 'pending', ?)`,
    )
    .bind(
      requestId,
      offer.title,
      offer.intro,
      offer.priceCents,
      offer.validUntil,
      serializeOffer({ greeting, intro: offer.intro, lines: offer.lines }),
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
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
  customer: { name: string; email: string; phone?: string | null },
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
    title: quote.title,
    greeting: stored.greeting,
    intro: stored.intro,
    lines,
    validUntilLabel: formatOfferDate(quote.valid_until),
    authorName,
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
