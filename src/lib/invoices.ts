import {
  openAmountCents,
  paymentTermsForDays,
  refreshPaymentStatus,
  type BillingKind,
  type SiteAddress,
} from "./billing";
import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "./email";
import { buildInvoicePdf, type InvoicePdfInput } from "./invoice-pdf";
import {
  CREDIT_MAIL_LEAD,
  INKASSO_MAIL_LEAD,
  INVOICE_MAIL_LEAD,
  MAHNUNG_MAIL_LEAD,
  REMINDER_MAIL_LEAD,
  STORNO_MAIL_LEAD,
  invoiceNumber,
  invoicePlainText,
  type ParsedInvoice,
} from "./invoice";
import {
  documentTotalCents,
  formatEuro,
  formatOfferDate,
  offerTotalCents,
  readStoredOffer,
  serializeOffer,
  type OfferLine,
  type StoredOffer,
} from "./quote";
import { applyOnlinePayment, applyRefund, applyTestPayment, applyTransferPayment, type PaymentRow, type PaymentUpdate } from "./stripe-pay";

export interface InvoiceRow {
  id: number;
  customer_id: number | null;
  quote_id: number | null;
  timesheet_id: number | null;
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
  reminded_at: number | null;
  reminder_level: number;
  due_days: number;
  payment_terms: string | null;
  site_name: string | null;
  site_street: string | null;
  site_postal_code: string | null;
  site_city: string | null;
  billing_kind: string;
  parent_invoice_id: number | null;
  amount_paid_cents: number;
}

export interface InvoicePaymentRow {
  id: number;
  invoice_id: number;
  amount_cents: number;
  paid_at: number;
  method: string;
  reference: string | null;
  note: string | null;
  created_at: number;
}

const COLUMNS = `id, customer_id, quote_id, timesheet_id, title, lines_json, price_cents, invoice_date, service_date, due_date,
  tax_number, buyer_name, buyer_email, buyer_phone, buyer_street, buyer_postal_code, buyer_city,
  created_at, sent_at, email_status, payment_status, paid_at, payment_method, payment_reference,
  payment_url, payment_link_id, payment_note, document_kind, related_invoice_id, reminded_at, reminder_level,
  due_days, payment_terms, site_name, site_street, site_postal_code, site_city, billing_kind, parent_invoice_id, amount_paid_cents`;

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

export async function listInvoicesInPeriod(
  db: D1Database,
  from: string,
  to: string,
): Promise<InvoiceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM invoices
        WHERE invoice_date >= ? AND invoice_date <= ?
        ORDER BY invoice_date, id`,
    )
    .bind(from, to)
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
    timesheetId?: number | null;
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
    site?: SiteAddress | null;
    createdAt: number;
    documentKind?: "rechnung" | "storno" | "gutschrift";
    relatedInvoiceId?: number | null;
    parentInvoiceId?: number | null;
    billingKind?: BillingKind;
    paymentStatus?: string;
  },
): Promise<number> {
  const dueDays = input.invoice.dueDays ?? 14;
  const paymentTerms = input.invoice.paymentTerms || paymentTermsForDays(dueDays);
  const billingKind = input.billingKind ?? input.invoice.billingKind ?? "voll";
  const site = input.site ?? null;
  const result = await db
    .prepare(
      `INSERT INTO invoices (
         customer_id, quote_id, timesheet_id, title, lines_json, price_cents, invoice_date, service_date, due_date,
         tax_number, buyer_name, buyer_email, buyer_phone, buyer_street, buyer_postal_code, buyer_city,
         created_at, sent_at, email_status, document_kind, related_invoice_id, payment_status,
         due_days, payment_terms, site_name, site_street, site_postal_code, site_city, billing_kind, parent_invoice_id, amount_paid_cents
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .bind(
      input.customerId,
      input.quoteId,
      input.timesheetId ?? null,
      input.invoice.title,
      serializeOffer({
        greeting: input.greeting,
        intro: input.invoice.intro,
        lines: input.invoice.lines,
        billing: "fest",
        discount: input.invoice.discount ?? null,
      }),
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
      dueDays,
      paymentTerms,
      site?.name ?? null,
      site?.street ?? null,
      site?.postalCode ?? null,
      site?.city ?? null,
      billingKind,
      input.parentInvoiceId ?? null,
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function sumCreditsForInvoice(db: D1Database, invoiceId: number): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(price_cents), 0) AS total
         FROM invoices
        WHERE related_invoice_id = ?
          AND document_kind = 'gutschrift'`,
    )
    .bind(invoiceId)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function listInvoicePayments(db: D1Database, invoiceId: number): Promise<InvoicePaymentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, invoice_id, amount_cents, paid_at, method, reference, note, created_at
         FROM invoice_payments
        WHERE invoice_id = ?
        ORDER BY paid_at DESC, id DESC`,
    )
    .bind(invoiceId)
    .all<InvoicePaymentRow>();
  return results ?? [];
}

export async function recordPartialPayment(
  db: D1Database,
  invoiceId: number,
  amountCents: number,
  paidAt: number,
  method = "Überweisung",
  note: string | null = null,
): Promise<"paid" | "partial" | "kept" | "missing"> {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return "kept";
  const row = await getInvoice(db, invoiceId);
  if (!row || row.document_kind !== "rechnung") return "missing";
  if (row.payment_status === "storniert" || row.payment_status === "erstattet") return "kept";
  const credited = await sumCreditsForInvoice(db, invoiceId);
  const open = openAmountCents(row, credited);
  if (open <= 0) return "kept";
  const take = Math.min(amountCents, open);
  const reference = `teil-${paidAt}-${take}`;
  await db
    .prepare(
      `INSERT INTO invoice_payments (invoice_id, amount_cents, paid_at, method, reference, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(invoiceId, take, paidAt, method, reference, note)
    .run();
  const paidTotal = Number(row.amount_paid_cents ?? 0) + take;
  const status = refreshPaymentStatus(row.price_cents, paidTotal, credited, row.payment_status);
  await db
    .prepare(
      `UPDATE invoices
          SET amount_paid_cents = ?, payment_status = ?, paid_at = ?, payment_method = ?, payment_reference = ?,
              payment_note = COALESCE(?, payment_note)
        WHERE id = ?`,
    )
    .bind(
      paidTotal,
      status,
      paidAt,
      method,
      reference,
      status === "bezahlt" ? null : `Teilzahlung ${formatEuro(take)} erfasst. Offen: ${formatEuro(open - take)}.`,
      invoiceId,
    )
    .run();
  return status === "bezahlt" ? "paid" : "partial";
}

export async function beginCreditNote(
  db: D1Database,
  original: InvoiceRow,
  lines: OfferLine[],
  today: string,
  createdAt: number,
): Promise<number | null> {
  if (original.document_kind !== "rechnung") return null;
  if (original.payment_status === "storniert") return null;
  const priceCents = offerTotalCents(lines);
  if (priceCents <= 0 || priceCents > original.price_cents) return null;
  const credited = await sumCreditsForInvoice(db, original.id);
  const open = openAmountCents(original, credited);
  if (priceCents > open && open > 0 && priceCents > original.price_cents - credited) {
    // allow credit up to remaining uncredited amount
  }
  if (credited + priceCents > original.price_cents) return null;
  const stored = readStoredOffer(original.lines_json, "");
  const originalNumber = invoiceNumber(original.id, original.invoice_date);
  const id = await saveInvoice(db, {
    customerId: original.customer_id,
    quoteId: original.quote_id,
    timesheetId: null,
    invoice: {
      title: original.title,
      intro: `Gutschrift zur Rechnung ${originalNumber} vom ${formatOfferDate(original.invoice_date)}.`,
      lines,
      invoiceDate: today,
      serviceDate: original.service_date <= today ? original.service_date : today,
      dueDate: today,
      priceCents,
      dueDays: 0,
      paymentTerms: "Gutschrift – kein Betrag zu zahlen.",
      billingKind: "voll",
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
    site: {
      name: original.site_name,
      street: original.site_street,
      postalCode: original.site_postal_code,
      city: original.site_city,
    },
    createdAt,
    documentKind: "gutschrift",
    relatedInvoiceId: original.id,
    paymentStatus: "bezahlt",
  });
  if (!id) return null;
  const newCredited = credited + priceCents;
  const status = refreshPaymentStatus(original.price_cents, Number(original.amount_paid_cents ?? 0), newCredited, original.payment_status);
  await db
    .prepare(`UPDATE invoices SET payment_status = ?, payment_note = ? WHERE id = ?`)
    .bind(
      status,
      `Gutschrift ${invoiceNumber(id, today)} über ${formatEuro(priceCents)}. Offen: ${formatEuro(Math.max(0, original.price_cents - Number(original.amount_paid_cents ?? 0) - newCredited))}.`,
      original.id,
    )
    .run();
  return id;
}

export async function beginStorno(db: D1Database, original: InvoiceRow, today: string, createdAt: number): Promise<number | null> {
  if (original.document_kind === "storno" || original.payment_status === "storniert") return null;
  const stored = readStoredOffer(original.lines_json, "");
  if (!stored.lines.length || documentTotalCents(stored.lines, stored.discount) !== original.price_cents) {
    return null;
  }
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
    timesheetId: original.timesheet_id,
    invoice: {
      title: original.title,
      intro: `Diese Stornorechnung hebt die Rechnung ${originalNumber} vom ${formatOfferDate(original.invoice_date)} vollständig auf.`,
      lines: stored.lines,
      invoiceDate: today,
      serviceDate,
      dueDate: today,
      priceCents: original.price_cents,
      dueDays: 0,
      paymentTerms: "Es ist kein Betrag zu zahlen.",
      billingKind: "voll",
      discount: stored.discount ?? null,
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
    site: {
      name: original.site_name,
      street: original.site_street,
      postalCode: original.site_postal_code,
      city: original.site_city,
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

export async function updateInvoiceReminder(
  db: D1Database,
  id: number,
  remindedAt: number,
  emailStatus: string,
  reminderLevel = 1,
): Promise<void> {
  const level = Math.min(3, Math.max(1, Math.floor(reminderLevel)));
  await db
    .prepare(
      `UPDATE invoices
          SET reminded_at = ?, reminder_level = ?, sent_at = COALESCE(sent_at, ?), email_status = ?
        WHERE id = ?`,
    )
    .bind(remindedAt, level, remindedAt, emailStatus, id)
    .run();
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

export async function recordTransferPayment(
  db: D1Database,
  id: number,
  paidAt: number,
  amountCents?: number | null,
): Promise<PaymentUpdate["kind"] | "partial" | "missing"> {
  const row = await getInvoice(db, id);
  if (!row) return "missing";
  const credited = await sumCreditsForInvoice(db, id);
  const open = openAmountCents(row, credited);
  if (open <= 0) return "unchanged";
  const amount = amountCents == null || !Number.isFinite(amountCents) ? open : Math.floor(amountCents);
  if (amount <= 0) return "unchanged";
  if (amount < open || Number(row.amount_paid_cents ?? 0) > 0 || credited > 0) {
    return recordPartialPayment(db, id, amount, paidAt);
  }
  const kind = await applyInvoicePayment(db, id, applyTransferPayment(paymentRow(row), paidAt));
  if (kind === "paid") {
    await db.prepare(`UPDATE invoices SET amount_paid_cents = ? WHERE id = ?`).bind(row.price_cents, id).run();
  }
  return kind;
}

export async function clearTransferPayment(db: D1Database, id: number): Promise<boolean> {
  const row = await getInvoice(db, id);
  if (!row) return false;
  const ref = row.payment_reference ?? "";
  if (!ref.startsWith("ueberweisung-") && !ref.startsWith("teil-")) return false;
  await db.prepare(`DELETE FROM invoice_payments WHERE invoice_id = ?`).bind(id).run();
  const result = await db
    .prepare(
      `UPDATE invoices
       SET payment_status = 'offen', paid_at = NULL, payment_method = NULL, payment_reference = NULL, amount_paid_cents = 0,
           payment_note = CASE WHEN payment_note = 'Der Zahlungslink ließ sich nicht schließen.' THEN NULL ELSE payment_note END
       WHERE id = ? AND payment_status IN ('bezahlt', 'teilbezahlt')`,
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
  const credit = row.document_kind === "gutschrift";
  const kind = storno ? "storno" : credit ? "gutschrift" : "rechnung";
  return {
    number: invoiceNumber(row.id, row.invoice_date),
    documentKind: kind,
    billingKind: row.billing_kind === "teil" || row.billing_kind === "schluss" ? row.billing_kind : "voll",
    referenceNumber:
      (storno || credit) && related ? invoiceNumber(related.id, related.invoice_date) : undefined,
    referenceDate: (storno || credit) && related ? related.invoice_date : undefined,
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
    siteName: row.site_name,
    siteStreet: row.site_street,
    sitePostalCode: row.site_postal_code,
    siteCity: row.site_city,
    paymentTerms: row.payment_terms || paymentTermsForDays(Number(row.due_days ?? 14)),
    title: row.title,
    greeting: stored.greeting,
    intro: stored.intro,
    lines: stored.lines,
    invoiceDate: row.invoice_date,
    serviceDate: row.service_date,
    dueDate: row.due_date,
    authorName,
    discount: stored.discount ?? null,
  };
}

export function renderInvoicePdf(
  row: InvoiceRow,
  stored: StoredOffer,
  authorName: string,
  related: InvoiceRow | null = null,
  noticeKind?: "erinnerung" | "mahnung" | "inkasso" | null,
): { filename: string; bytes: Uint8Array } {
  const kind =
    noticeKind === "erinnerung" || noticeKind === "mahnung" || noticeKind === "inkasso"
      ? noticeKind
      : undefined;
  const input = {
    ...invoicePdfInput(row, stored, authorName, related),
    noticeKind: kind,
  };
  const prefix =
    kind === "inkasso"
      ? "Letzte-Mahnung"
      : kind === "mahnung"
        ? "Mahnung"
        : kind === "erinnerung"
          ? "Zahlungserinnerung"
          : input.documentKind === "storno"
            ? "Stornorechnung"
            : input.documentKind === "gutschrift"
              ? "Gutschrift"
              : input.billingKind === "teil"
                ? "Teilrechnung"
                : input.billingKind === "schluss"
                  ? "Schlussrechnung"
                  : "Rechnung";
  return { filename: `${prefix}-${input.number}.pdf`, bytes: buildInvoicePdf(input) };
}

export async function relatedInvoice(db: D1Database, row: InvoiceRow): Promise<InvoiceRow | null> {
  if (
    (row.document_kind !== "storno" && row.document_kind !== "gutschrift") ||
    !row.related_invoice_id
  ) {
    return null;
  }
  return getInvoice(db, row.related_invoice_id);
}

export function invoiceMailFooter(input: {
  purpose?: "rechnung" | "storno" | "gutschrift" | "erinnerung" | "mahnung" | "inkasso" | null;
  paymentStatus?: string | null;
  paymentUrl?: string | null;
  paymentMode?: "test" | "live" | "off" | null;
  footerNote?: string | null;
}): string {
  const custom = input.footerNote?.trim();
  if (custom) return custom;
  const storno = input.purpose === "storno";
  const credit = input.purpose === "gutschrift";
  const paid = input.paymentStatus === "bezahlt" || input.paymentStatus === "erstattet";
  const cancelled = input.paymentStatus === "storniert";
  const paymentUrl = paid || cancelled || storno || credit ? "" : input.paymentUrl?.trim() || "";
  const testPay = Boolean(paymentUrl) && input.paymentMode === "test";
  if (storno) return "Sie können direkt auf diese E-Mail antworten.";
  if (credit) return "Die Gutschrift ist verbucht. Sie können direkt auf diese E-Mail antworten.";
  if (cancelled) return "Diese Rechnung ist storniert. Sie können direkt auf diese E-Mail antworten.";
  if (paid) return "Diese Rechnung ist bezahlt. Sie können direkt auf diese E-Mail antworten.";
  if (testPay) return "Testmodus: Es wird kein Geld abgebucht. Sie können direkt auf diese E-Mail antworten.";
  if (input.purpose === "inkasso") {
    return "Ohne Zahlung behalte ich mir vor, ein Inkassounternehmen zu beauftragen. Sie können direkt auf diese E-Mail antworten.";
  }
  if (input.purpose === "erinnerung" || input.purpose === "mahnung") {
    return "Falls die Zahlung inzwischen unterwegs ist, bitte diese Erinnerung ignorieren. Sie können direkt auf diese E-Mail antworten.";
  }
  return "Sie können direkt auf diese E-Mail antworten.";
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
    purpose?: "rechnung" | "storno" | "gutschrift" | "erinnerung" | "mahnung" | "inkasso";
    /** Ersetzt den automatischen Fuß, zum Beispiel beim Systemcheck. */
    footerNote?: string | null;
    /** Zusätzliche PDFs, z. B. der zugehörige Stundenzettel. */
    extraAttachments?: Array<{ filename: string; pdf: Uint8Array }>;
  },
): Promise<{ sentAt: number | null; emailStatus: string }> {
  const storno = input.purpose === "storno";
  const credit = input.purpose === "gutschrift";
  const inkasso = input.purpose === "inkasso";
  const mahnung = input.purpose === "mahnung";
  const reminder = input.purpose === "erinnerung" || mahnung || inkasso;
  const subject = inkasso
    ? `Letzte Mahnung · Rechnung ${input.number}: ${input.invoice.title}`
    : mahnung
      ? `2. Mahnung · Rechnung ${input.number}: ${input.invoice.title}`
      : input.purpose === "erinnerung"
        ? `Zahlungserinnerung · Rechnung ${input.number}: ${input.invoice.title}`
        : credit
          ? `Gutschrift ${input.number}: ${input.invoice.title}`
          : `${storno ? "Stornorechnung" : "Rechnung"} ${input.number}: ${input.invoice.title}`;
  const from = "info@zeus-service.de";
  const paid = input.paymentStatus === "bezahlt" || input.paymentStatus === "erstattet";
  const cancelled = input.paymentStatus === "storniert";
  const paymentUrl = paid || cancelled || storno || credit ? "" : input.paymentUrl?.trim() || "";
  const amount = formatEuro(input.invoice.priceCents);
  const lead = storno
    ? STORNO_MAIL_LEAD
    : credit
      ? CREDIT_MAIL_LEAD
      : inkasso
        ? INKASSO_MAIL_LEAD
        : mahnung
          ? MAHNUNG_MAIL_LEAD
          : reminder
            ? REMINDER_MAIL_LEAD
            : INVOICE_MAIL_LEAD;
  const plain = invoicePlainText({
    priceCents: input.invoice.priceCents,
    dueDate: input.invoice.dueDate,
    number: input.number,
    storno: storno || credit,
    settled: paid || cancelled || credit,
    reminder,
    mailLead: lead,
  });
  const prefix = `${lead}\n${amount}\n\n`;
  const body = plain.startsWith(prefix) ? plain.slice(prefix.length) : plain;
  const footerNote = invoiceMailFooter(input);
  const mail = {
    siteName: env.SITE_NAME ?? "Zeus-Service",
    siteUrl: env.SITE_URL ?? "https://zeus-service.de",
    recipientName: input.recipientName,
    subject,
    authorName: input.authorName,
    fromEmail: from,
    replyToEmail: from,
    heading: input.invoice.title,
    eyebrow: inkasso
      ? `Letzte Mahnung · Rechnung ${input.number}`
      : mahnung
        ? `2. Mahnung · Rechnung ${input.number}`
        : reminder
          ? `Zahlungserinnerung · Rechnung ${input.number}`
          : credit
            ? `Gutschrift ${input.number}`
            : `${storno ? "Stornorechnung" : "Rechnung"} ${input.number}`,
    greeting: input.greeting,
    footerNote,
    summaryLabel: lead,
    summaryAmount: amount,
    ctaUrl: paymentUrl || null,
    ctaLabel: "Jetzt bezahlen",
    ctaFirst: Boolean(paymentUrl),
    ctaTone: "green",
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
    attachments: [
      { filename: input.filename, type: "application/pdf", disposition: "attachment", content: input.pdf },
      ...(input.extraAttachments ?? []).map((file) => ({
        filename: file.filename,
        type: "application/pdf" as const,
        disposition: "attachment" as const,
        content: file.pdf,
      })),
    ],
  });
  if (result.ok) return { sentAt: Math.floor(Date.now() / 1000), emailStatus: `sent:${result.via}` };
  return { sentAt: null, emailStatus: result.via === "none" ? "skipped:no_transport" : `failed:${result.via}` };
}
