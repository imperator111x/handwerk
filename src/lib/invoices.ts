import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "./email";
import { buildInvoicePdf, type InvoicePdfInput } from "./invoice-pdf";
import { INVOICE_MAIL_LEAD, STORNO_MAIL_LEAD, invoiceNumber, invoicePlainText, type ParsedInvoice } from "./invoice";
import { formatEuro, formatOfferDate, offerTotalCents, readStoredOffer, serializeOffer, type StoredOffer } from "./quote";
import { applyOnlinePayment, applyRefund, applyTestPayment, applyTransferPayment, type PaymentRow, type PaymentUpdate } from "./stripe-pay";

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
  payment_status: string;
  paid_at: number | null;
  payment_method: string | null;
  payment_reference: string | null;
  payment_url: string | null;
  payment_link_id: string | null;
  payment_note: string | null;
  document_kind: string;
  related_invoice_id: number | null;
}

const COLUMNS = `id, customer_id, quote_id, title, lines_json, price_cents, invoice_date, service_date, due_date,
  tax_number, buyer_name, buyer_email, buyer_phone, buyer_street, buyer_postal_code, buyer_city,
  created_at, sent_at, email_status, payment_status, paid_at, payment_method, payment_reference,
  payment_url, payment_link_id, payment_note, document_kind, related_invoice_id`;

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
    customerId: number | null;
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
    documentKind?: "rechnung" | "storno";
    relatedInvoiceId?: number | null;
    paymentStatus?: string;
  },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO invoices (
         customer_id, quote_id, title, lines_json, price_cents, invoice_date, service_date, due_date,
         tax_number, buyer_name, buyer_email, buyer_phone, buyer_street, buyer_postal_code, buyer_city,
         created_at, sent_at, email_status, document_kind, related_invoice_id, payment_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, ?)`,
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
      input.documentKind ?? "rechnung",
      input.relatedInvoiceId ?? null,
      input.paymentStatus ?? "offen",
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function beginStorno(db: D1Database, original: InvoiceRow, today: string, createdAt: number): Promise<number | null> {
  if (original.document_kind === "storno" || original.payment_status === "storniert") return null;
  const stored = readStoredOffer(original.lines_json, "");
  if (!stored.lines.length || offerTotalCents(stored.lines) !== original.price_cents) return null;
  const serviceDate = original.service_date <= today ? original.service_date : today;
  const marked = await db
    .prepare(
      `UPDATE invoices SET payment_status = 'storniert'
       WHERE id = ? AND payment_status != 'storniert' AND document_kind = 'rechnung'`,
    )
    .bind(original.id)
    .run();
  if (typeof marked.meta.changes === "number") {
    if (marked.meta.changes < 1) return null;
  } else {
    const current = await getInvoice(db, original.id);
    if (current?.payment_status !== "storniert") return null;
  }
  const originalNumber = invoiceNumber(original.id, original.invoice_date);
  const id = await saveInvoice(db, {
    customerId: original.customer_id,
    quoteId: original.quote_id,
    invoice: {
      title: original.title,
      intro: `Diese Stornorechnung hebt die Rechnung ${originalNumber} vom ${formatOfferDate(original.invoice_date)} vollständig auf.`,
      lines: stored.lines,
      invoiceDate: today,
      serviceDate,
      dueDate: today,
      priceCents: original.price_cents,
    },
    greeting: stored.greeting,
    taxNumber: original.tax_number,
    buyer: {
      name: original.buyer_name,
      email: original.buyer_email,
      phone: original.buyer_phone,
      street: original.buyer_street,
      postalCode: original.buyer_postal_code,
      city: original.buyer_city,
    },
    createdAt,
    documentKind: "storno",
    relatedInvoiceId: original.id,
    paymentStatus: "storniert",
  });
  if (!id) return null;
  const paid = original.payment_method ? `Die Zahlung per ${original.payment_method} bleibt vermerkt. ` : "";
  await noteInvoicePayment(db, original.id, `${paid}Aufgehoben durch Stornorechnung ${invoiceNumber(id, today)}.`);
  return id;
}

export async function listRelatedInvoices(db: D1Database, id: number): Promise<InvoiceRow[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM invoices WHERE related_invoice_id = ? ORDER BY id`)
    .bind(id)
    .all<InvoiceRow>();
  return results ?? [];
}

export async function updateInvoiceDelivery(db: D1Database, id: number, sentAt: number | null, emailStatus: string): Promise<void> {
  await db.prepare(`UPDATE invoices SET sent_at = COALESCE(?, sent_at), email_status = ? WHERE id = ?`).bind(sentAt, emailStatus, id).run();
}

export function paymentRow(row: InvoiceRow): PaymentRow {
  return {
    priceCents: row.price_cents,
    status: row.payment_status,
    reference: row.payment_reference,
    method: row.payment_method,
    paidAt: row.paid_at,
    note: row.payment_note,
  };
}

export async function saveInvoicePaymentLink(db: D1Database, id: number, url: string, linkId: string, replace = false): Promise<void> {
  const where = replace ? "WHERE id = ?" : "WHERE id = ? AND payment_url IS NULL";
  await db
    .prepare(
      `UPDATE invoices
       SET payment_url = ?, payment_link_id = ?,
           payment_note = CASE WHEN payment_note = 'Der Zahlungslink konnte nicht angelegt werden. Bitte erneut senden.' THEN NULL ELSE payment_note END
       ${where}`,
    )
    .bind(url, linkId, id)
    .run();
}

export async function applyInvoicePayment(db: D1Database, id: number, update: PaymentUpdate, reference = ""): Promise<PaymentUpdate["kind"]> {
  if (update.kind === "paid") {
    const result = await db
      .prepare(
        `UPDATE invoices
         SET payment_status = 'bezahlt', paid_at = ?, payment_method = ?, payment_reference = ?, payment_note = ?
         WHERE id = ? AND payment_status IN ('offen', 'test')`,
      )
      .bind(update.paidAt, update.method, update.reference, update.note, id)
      .run();
    if (typeof result.meta.changes === "number") return result.meta.changes > 0 ? "paid" : "unchanged";
    const current = await getInvoice(db, id);
    return current?.payment_status === "bezahlt" && current.payment_reference === update.reference ? "paid" : "unchanged";
  }
  if (update.kind === "test") {
    const result = await db
      .prepare(
        `UPDATE invoices
         SET payment_status = 'test', paid_at = ?, payment_method = ?, payment_reference = ?, payment_note = ?
         WHERE id = ? AND payment_status NOT IN ('bezahlt', 'erstattet', 'storniert')`,
      )
      .bind(update.paidAt, update.method, update.reference, update.note, id)
      .run();
    if (typeof result.meta.changes === "number") return result.meta.changes > 0 ? "test" : "unchanged";
    const current = await getInvoice(db, id);
    return current?.payment_status === "test" && current.payment_reference === update.reference ? "test" : "unchanged";
  }
  if (update.kind === "noted") {
    await db.prepare(`UPDATE invoices SET payment_note = ? WHERE id = ?`).bind(update.note, id).run();
    return "noted";
  }
  if (update.kind === "refunded") {
    const result = await db
      .prepare(
        `UPDATE invoices SET payment_status = 'erstattet'
         WHERE id = ? AND payment_status = 'bezahlt' AND payment_reference = ?`,
      )
      .bind(id, reference)
      .run();
    if (typeof result.meta.changes === "number") return result.meta.changes > 0 ? "refunded" : "unchanged";
    const current = await getInvoice(db, id);
    return current?.payment_status === "erstattet" ? "refunded" : "unchanged";
  }
  return update.kind;
}

export async function recordOnlinePayment(
  db: D1Database,
  id: number,
  incoming: { amountCents: number; reference: string; method: string; paidAt: number },
): Promise<PaymentUpdate["kind"] | "missing"> {
  const row = await getInvoice(db, id);
  if (!row) return "missing";
  const update = applyOnlinePayment(paymentRow(row), incoming);
  return applyInvoicePayment(db, id, update);
}

export async function recordTestPayment(
  db: D1Database,
  id: number,
  incoming: { amountCents: number; reference: string; method: string; paidAt: number },
): Promise<PaymentUpdate["kind"] | "missing"> {
  const row = await getInvoice(db, id);
  if (!row) return "missing";
  return applyInvoicePayment(db, id, applyTestPayment(paymentRow(row), incoming));
}

export async function recordRefund(db: D1Database, id: number, reference: string, full: boolean): Promise<PaymentUpdate["kind"] | "missing"> {
  const row = await getInvoice(db, id);
  if (!row) return "missing";
  const update = applyRefund(paymentRow(row), { reference, full });
  return applyInvoicePayment(db, id, update, reference);
}

export async function findInvoiceIdByPaymentReference(db: D1Database, reference: string): Promise<number | null> {
  const row = await db
    .prepare(`SELECT id FROM invoices WHERE payment_reference = ? LIMIT 1`)
    .bind(reference)
    .first<{ id: number }>();
  return row?.id ?? null;
}

export async function recordTransferPayment(db: D1Database, id: number, paidAt: number): Promise<PaymentUpdate["kind"] | "missing"> {
  const row = await getInvoice(db, id);
  if (!row) return "missing";
  return applyInvoicePayment(db, id, applyTransferPayment(paymentRow(row), paidAt));
}

export async function clearTransferPayment(db: D1Database, id: number): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE invoices
       SET payment_status = 'offen', paid_at = NULL, payment_method = NULL, payment_reference = NULL,
           payment_note = CASE WHEN payment_note = 'Der Zahlungslink ließ sich nicht schließen.' THEN NULL ELSE payment_note END
       WHERE id = ? AND payment_status = 'bezahlt' AND payment_reference LIKE 'ueberweisung-%'`,
    )
    .bind(id)
    .run();
  if (typeof result.meta.changes === "number") return result.meta.changes > 0;
  const current = await getInvoice(db, id);
  return current?.payment_status === "offen";
}

export async function noteInvoicePayment(db: D1Database, id: number, note: string): Promise<void> {
  await db.prepare(`UPDATE invoices SET payment_note = ? WHERE id = ?`).bind(note, id).run();
}

export function invoicePdfInput(
  row: InvoiceRow,
  stored: StoredOffer,
  authorName: string,
  related: InvoiceRow | null = null,
): InvoicePdfInput {
  const storno = row.document_kind === "storno";
  return {
    number: invoiceNumber(row.id, row.invoice_date),
    documentKind: storno ? "storno" : "rechnung",
    referenceNumber: storno && related ? invoiceNumber(related.id, related.invoice_date) : undefined,
    referenceDate: storno && related ? related.invoice_date : undefined,
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

export function renderInvoicePdf(
  row: InvoiceRow,
  stored: StoredOffer,
  authorName: string,
  related: InvoiceRow | null = null,
): { filename: string; bytes: Uint8Array } {
  const input = invoicePdfInput(row, stored, authorName, related);
  const prefix = input.documentKind === "storno" ? "Stornorechnung" : "Rechnung";
  return { filename: `${prefix}-${input.number}.pdf`, bytes: buildInvoicePdf(input) };
}

export async function relatedInvoice(db: D1Database, row: InvoiceRow): Promise<InvoiceRow | null> {
  if (row.document_kind !== "storno" || !row.related_invoice_id) return null;
  return getInvoice(db, row.related_invoice_id);
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
    paymentUrl?: string | null;
    paymentStatus?: string | null;
    paymentMode?: "test" | "live" | "off" | null;
    purpose?: "rechnung" | "storno";
  },
): Promise<{ sentAt: number | null; emailStatus: string }> {
  const storno = input.purpose === "storno";
  const subject = `${storno ? "Stornorechnung" : "Rechnung"} ${input.number}: ${input.invoice.title}`;
  const from = "info@zeus-service.de";
  const paid = input.paymentStatus === "bezahlt" || input.paymentStatus === "erstattet";
  const cancelled = input.paymentStatus === "storniert";
  const paymentUrl = paid || cancelled || storno ? "" : input.paymentUrl?.trim() || "";
  const testPay = Boolean(paymentUrl) && input.paymentMode === "test";
  const plain = invoicePlainText({
    priceCents: input.invoice.priceCents,
    dueDate: input.invoice.dueDate,
    storno,
    settled: paid || cancelled,
  });
  const amount = formatEuro(input.invoice.priceCents);
  const lead = storno ? STORNO_MAIL_LEAD : INVOICE_MAIL_LEAD;
  const prefix = `${lead}\n${amount}\n\n`;
  const body = plain.startsWith(prefix) ? plain.slice(prefix.length) : plain;
  const footerNote = storno
    ? "Sie können direkt auf diese E-Mail antworten."
    : cancelled
      ? "Diese Rechnung ist storniert. Sie können direkt auf diese E-Mail antworten."
      : paid
        ? "Diese Rechnung ist bezahlt. Sie können direkt auf diese E-Mail antworten."
        : testPay
          ? "Testmodus: Es wird kein Geld abgebucht. Sie können direkt auf diese E-Mail antworten."
          : "Sie können direkt auf diese E-Mail antworten.";
  const mail = {
    siteName: env.SITE_NAME ?? "Zeus-Service",
    siteUrl: env.SITE_URL ?? "https://zeus-service.de",
    recipientName: input.recipientName,
    subject,
    authorName: input.authorName,
    fromEmail: from,
    replyToEmail: from,
    heading: input.invoice.title,
    eyebrow: `${storno ? "Stornorechnung" : "Rechnung"} ${input.number}`,
    greeting: input.greeting,
    footerNote,
    summaryLabel: lead,
    summaryAmount: amount,
    ctaUrl: paymentUrl || null,
    ctaLabel: "Jetzt bezahlen",
    ctaFirst: Boolean(paymentUrl),
    hideCtaUrl: true,
  };
  const result = await sendEmail(env, {
    from: env.CONTACT_FROM_EMAIL ?? "website@zeus-service.de",
    fromName: env.SITE_NAME ?? "Zeus-Service",
    to: input.to,
    replyTo: from,
    subject,
    html: renderReplyEmailHtml({ ...mail, bodyText: body }),
    text: renderReplyEmailText({ ...mail, bodyText: body }),
    attachments: [{ filename: input.filename, type: "application/pdf", disposition: "attachment", content: input.pdf }],
  });
  if (result.ok) return { sentAt: Math.floor(Date.now() / 1000), emailStatus: `sent:${result.via}` };
  return { sentAt: null, emailStatus: result.via === "none" ? "skipped:no_transport" : `failed:${result.via}` };
}
