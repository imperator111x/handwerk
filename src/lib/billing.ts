export type BillingKind = "voll" | "teil" | "schluss";

export const BILLING_KINDS = ["voll", "teil", "schluss"] as const;

export const DUE_DAY_OPTIONS = [0, 7, 14, 21, 30, 60] as const;

export function paymentTermsForDays(days: number): string {
  if (days <= 0) return "Zahlbar sofort ohne Abzug.";
  return `Zahlbar innerhalb von ${days} Tagen ohne Abzug.`;
}

export function parseDueDays(raw: string | null | undefined, fallback = 14): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 0 || n > 90) return fallback;
  return n;
}

export function dueDateFromInvoiceDate(invoiceDate: string, dueDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(invoiceDate);
  if (!match) return invoiceDate;
  const days = Math.max(0, dueDays);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

export function parseBillingKind(raw: string | null | undefined): BillingKind {
  const value = String(raw ?? "").trim();
  if (value === "teil" || value === "schluss") return value;
  return "voll";
}

export function billingKindLabel(kind: string | null | undefined): string {
  if (kind === "teil") return "Teilrechnung";
  if (kind === "schluss") return "Schlussrechnung";
  return "Rechnung";
}

export interface SiteAddress {
  name: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
}

export function parseSiteForm(form: FormData, prefix = "site_"): SiteAddress {
  const clean = (key: string, max: number) => {
    const text = String(form.get(`${prefix}${key}`) ?? "")
      .trim()
      .replace(/\s+/g, " ");
    return text ? text.slice(0, max) : null;
  };
  return {
    name: clean("name", 120),
    street: clean("street", 120),
    postalCode: clean("postal_code", 12),
    city: clean("city", 80),
  };
}

export function siteAddressLabel(site: {
  site_name?: string | null;
  site_street?: string | null;
  site_postal_code?: string | null;
  site_city?: string | null;
}): string {
  const place = [site.site_postal_code, site.site_city].filter(Boolean).join(" ");
  return [site.site_name, site.site_street, place].filter(Boolean).join(", ");
}

export function hasSiteAddress(site: {
  site_street?: string | null;
  site_postal_code?: string | null;
  site_city?: string | null;
}): boolean {
  return Boolean(site.site_street?.trim() && site.site_postal_code?.trim() && site.site_city?.trim());
}

/** Offener Restbetrag: Rechnungsbetrag − Zahlungen − Gutschriften. */
export function openAmountCents(
  row: {
    price_cents: number;
    amount_paid_cents?: number | null;
    document_kind: string;
    payment_status: string;
  },
  creditedCents = 0,
): number {
  if (row.document_kind === "storno" || row.document_kind === "gutschrift") return 0;
  if (row.payment_status === "storniert" || row.payment_status === "erstattet") return 0;
  const paid = Math.max(0, Number(row.amount_paid_cents ?? 0));
  const credit = Math.max(0, creditedCents);
  return Math.max(0, row.price_cents - paid - credit);
}

export function refreshPaymentStatus(
  priceCents: number,
  amountPaidCents: number,
  creditedCents: number,
  current: string,
): string {
  if (current === "storniert" || current === "erstattet") return current;
  const open = Math.max(0, priceCents - amountPaidCents - creditedCents);
  if (open <= 0) return "bezahlt";
  if (amountPaidCents > 0 || creditedCents > 0) return "teilbezahlt";
  if (current === "test") return "test";
  return "offen";
}
