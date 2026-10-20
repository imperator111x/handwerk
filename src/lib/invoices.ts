import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "./email";
import { buildInvoicePdf, type InvoicePdfInput } from "./invoice-pdf";
import { invoiceNumber, invoicePlainText, type ParsedInvoice } from "./invoice";
import { formatOfferDate, serializeOffer, type StoredOffer } from "./quote";

export interface InvoiceRow {
  id: number;
  customer_id: number | null;
  quote_id: number | null;
  title: string;
  lines_json: string;
  price_cents: number;
  invoice_date: string;
  service_date: string;
  due_date: string;
  tax_number: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  buyer_street: string;
  buyer_postal_code: string;
  buyer_city: string;
  created_at: number;
  sent_at: number | null;
  email_status: string | null;
}

const COLUMNS = `id, customer_id, quote_id, title, lines_json, price_cents, invoice_date, service_date, due_date,
  tax_number, buyer_name, buyer_email, buyer_phone, buyer_street, buyer_postal_code, buyer_city,
  created_at, sent_at, email_status`;

export async function getTaxNumber(db: D1Database): Promise<string> {
  const row = await db.prepare(`SELECT tax_number FROM business_profile WHERE id = 1`).first<{ tax_number: string }>();
  return row?.tax_number?.trim() ?? "";
}

export async function saveTaxNumber(db: D1Database, taxNumber: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO business_profile (id, tax_number) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET tax_number = excluded.tax_number`,
    )
    .bind(taxNumber)
    .run();
}

export async function listInvoices(db: D1Database): Promise<InvoiceRow[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM invoices ORDER BY created_at DESC, id DESC`)
    .all<InvoiceRow>();
  return results ?? [];
}

export async function listInvoicesForCustomer(db: D1Database, customerId: number): Promise<InvoiceRow[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM invoices WHERE customer_id = ? ORDER BY created_at DESC, id DESC`)
    .bind(customerId)
    .all<InvoiceRow>();
  return results ?? [];
}

export async function getInvoice(db: D1Database, id: number): Promise<InvoiceRow | null> {
  return await db.prepare(`SELECT ${COLUMNS} FROM invoices WHERE id = ?`).bind(id).first<InvoiceRow>();
}

export async function saveInvoice(
  db: D1Database,
  input: {
    customerId: number;
    quoteId: number | null;
    invoice: ParsedInvoice;
    greeting: string | null;
    taxNumber: string;
    buyer: {
      name: string;
      email: string;
      phone: string | null;
      street: string;
      postalCode: string;
      city: string;
    };
    createdAt: number;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO invoices (
         customer_id, quote_id, title, lines_json, price_cents, invoice_date, service_date, due_date,
         tax_number, buyer_name, buyer_email, buyer_phone, buyer_street, buyer_postal_code, buyer_city,
         created_at, sent_at, email_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending')`,
    )
    .bind(
      input.customerId,
      input.quoteId,
      input.invoice.title,
      serializeOffer({ greeting: input.greeting, intro: input.invoice.intro, lines: input.invoice.lines }),
      input.invoice.priceCents,
      input.invoice.invoiceDate,
      input.invoice.serviceDate,
      input.invoice.dueDate,
      input.taxNumber,
      input.buyer.name,
      input.buyer.email,
      input.buyer.phone,
      input.buyer.street,
      input.buyer.postalCode,
      input.buyer.city,
      input.createdAt,
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function updateInvoiceDelivery(db: D1Database, id: number, sentAt: number | null, emailStatus: string): Promise<void> {
  await db.prepare(`UPDATE invoices SET sent_at = COALESCE(?, sent_at), email_status = ? WHERE id = ?`).bind(sentAt, emailStatus, id).run();
}

export function invoicePdfInput(row: InvoiceRow, stored: StoredOffer, authorName: string): InvoicePdfInput {
  return {
    number: invoiceNumber(row.id, row.invoice_date),
    invoiceDateLabel: formatOfferDate(row.invoice_date),
    serviceDateLabel: formatOfferDate(row.service_date),
    dueDateLabel: formatOfferDate(row.due_date),
    taxNumber: row.tax_number,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    buyerPhone: row.buyer_phone,
    buyerStreet: row.buyer_street,
    buyerPostalCode: row.buyer_postal_code,
    buyerCity: row.buyer_city,
    title: row.title,
    greeting: stored.greeting,
    intro: stored.intro,
    lines: stored.lines,
    invoiceDate: row.invoice_date,
    serviceDate: row.service_date,
    dueDate: row.due_date,
    authorName,
  };
}

export function renderInvoicePdf(row: InvoiceRow, stored: StoredOffer, authorName: string): { filename: string; bytes: Uint8Array } {
  const input = invoicePdfInput(row, stored, authorName);
  return { filename: `Rechnung-${input.number}.pdf`, bytes: buildInvoicePdf(input) };
}

export async function sendInvoiceEmail(
  env: Env,
  input: {
    to: string;
    recipientName: string;
    authorName: string;
    greeting?: string | null;
    invoice: ParsedInvoice;
    taxNumber: string;
    filename: string;
    pdf: Uint8Array;
    number: string;
  },
): Promise<{ sentAt: number | null; emailStatus: string }> {
  const plain = invoicePlainText({
    number: input.number,
    title: input.invoice.title,
    intro: input.invoice.intro,
    lines: input.invoice.lines,
    invoiceDate: input.invoice.invoiceDate,
    serviceDate: input.invoice.serviceDate,
    dueDate: input.invoice.dueDate,
    taxNumber: input.taxNumber,
  });
  const subject = `Rechnung ${input.number}: ${input.invoice.title}`;
  const from = "info@zeus-service.de";
  const footerNote = `Fällig am ${formatOfferDate(input.invoice.dueDate)}. Sie können direkt auf diese E-Mail antworten.`;
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
      eyebrow: "Rechnung",
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
    attachments: [{ filename: input.filename, type: "application/pdf", disposition: "attachment", content: input.pdf }],
  });
  if (result.ok) return { sentAt: Math.floor(Date.now() / 1000), emailStatus: `sent:${result.via}` };
  return { sentAt: null, emailStatus: result.via === "none" ? "skipped:no_transport" : `failed:${result.via}` };
}
