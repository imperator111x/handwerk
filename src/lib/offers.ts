import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "./email";
import { formatEuro, formatOfferDate, offerPlainText, parseEuroToCents } from "./quote";

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
}

export function berlinTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function cleanOffer(form: FormData, today = berlinTodayIso()): {
  title: string;
  body: string;
  priceCents: number;
  validUntil: string;
} | null {
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const validUntil = String(form.get("valid_until") ?? "").trim();
  const priceCents = parseEuroToCents(String(form.get("price") ?? ""));
  if (title.length < 3 || title.length > 120) return null;
  if (body.length < 10 || body.length > 4000) return null;
  if (priceCents == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || validUntil < today) return null;
  const span = Date.parse(`${validUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(span) || span > 366 * 86_400_000) return null;
  return { title, body, priceCents, validUntil };
}

export async function listQuotes(db: D1Database, requestId: number): Promise<QuoteRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, request_id, title, body, price_cents, valid_until, created_at, sent_at, email_status
         FROM quotes WHERE request_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .bind(requestId)
    .all<QuoteRow>();
  return results ?? [];
}

export async function saveQuote(
  db: D1Database,
  requestId: number,
  offer: { title: string; body: string; priceCents: number; validUntil: string },
  delivery: { sentAt: number | null; emailStatus: string },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO quotes (request_id, title, body, price_cents, valid_until, sent_at, email_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      requestId,
      offer.title,
      offer.body,
      offer.priceCents,
      offer.validUntil,
      delivery.sentAt,
      delivery.emailStatus,
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function sendOfferEmail(
  env: Env,
  input: {
    to: string;
    recipientName: string;
    authorName: string;
    offer: { title: string; body: string; priceCents: number; validUntil: string };
  },
): Promise<{ sentAt: number | null; emailStatus: string }> {
  const plain = offerPlainText(input.offer);
  const subject = `Festpreis-Angebot: ${input.offer.title}`;
  const from = "info@zeus-service.de";
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
      eyebrow: "Festpreis-Angebot",
      footerNote: `Gültig bis ${formatOfferDate(input.offer.validUntil)}. Sie können direkt auf diese E-Mail antworten.`,
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
      footerNote: `Gültig bis ${formatOfferDate(input.offer.validUntil)}. Sie können direkt auf diese E-Mail antworten.`,
    }),
  });
  if (result.ok) {
    return { sentAt: Math.floor(Date.now() / 1000), emailStatus: `sent:${result.via}` };
  }
  return { sentAt: null, emailStatus: result.via === "none" ? "skipped:no_transport" : `failed:${result.via}` };
}

export { formatEuro };
