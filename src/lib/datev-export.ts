import { billingKindLabel } from "./billing";
import { SELLER, invoiceNumber } from "./invoice";
import type { InvoiceRow } from "./invoices";
import { formatOfferDate } from "./quote";
import { invoiceStatusLabel } from "./stripe-pay";

function csvEscape(value: string): string {
  const text = value.replace(/\r?\n/g, " ").trim();
  if (/[";]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function centsToDe(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Einfacher Buchhalter-/DATEV-ähnlicher Monats-CSV (Semikolon, DE). */
export function buildDatevCsv(rows: InvoiceRow[], periodFrom: string, periodTo: string): string {
  const header = [
    "Belegdatum",
    "Belegfeld1",
    "Buchungstext",
    "Umsatz",
    "SollHaben",
    "Konto",
    "Gegenkonto",
    "BU",
    "Belegfeld2",
    "DocumentKind",
    "BillingKind",
    "Zahlungsstatus",
    "BezahltAm",
    "Kunde",
    "Kundenmail",
    "FaelligAm",
    "Steuernummer",
    "IBAN",
  ].join(";");

  const lines = rows.map((row) => {
    const number = invoiceNumber(row.id, row.invoice_date);
    const creditOrStorno = row.document_kind === "storno" || row.document_kind === "gutschrift";
    const text = [
      billingKindLabel(row.billing_kind),
      row.title,
      row.buyer_name,
      creditOrStorno && row.related_invoice_id ? `zu #${row.related_invoice_id}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return [
      formatOfferDate(row.invoice_date),
      number,
      csvEscape(text),
      centsToDe(row.price_cents),
      creditOrStorno ? "H" : "S",
      creditOrStorno ? "8400" : "1400",
      creditOrStorno ? "1400" : "8400",
      "0",
      row.payment_reference ?? "",
      row.document_kind,
      row.billing_kind || "voll",
      invoiceStatusLabel(row.payment_status, row.document_kind, row.billing_kind),
      row.paid_at ? String(row.paid_at) : "",
      csvEscape(row.buyer_name),
      row.buyer_email,
      formatOfferDate(row.due_date),
      row.tax_number,
      SELLER.iban,
    ].join(";");
  });

  const intro = [
    `# Zeus-Service Buchhalter-Export`,
    `# Zeitraum ${formatOfferDate(periodFrom)} bis ${formatOfferDate(periodTo)}`,
    `# Konten: 1400 Forderungen, 8400 Erlöse (Kleinunternehmer, ohne USt) – bitte anpassen`,
    `# Gläubiger: ${SELLER.tradeName} / ${SELLER.personName}`,
    header,
    ...lines,
    "",
  ];
  return intro.join("\r\n");
}

export function monthBounds(yearMonth: string): { from: string; to: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const from = `${match[1]}-${match[2]}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${match[1]}-${match[2]}-${String(last).padStart(2, "0")}`;
  return { from, to };
}
