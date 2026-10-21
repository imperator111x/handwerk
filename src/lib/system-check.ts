import { buildInvoicePdf } from "./invoice-pdf";
import { INVOICE_DEFAULT_INTRO, SELLER, addIsoDays, type ParsedInvoice } from "./invoice";
import { berlinTodayIso } from "./offers";
import { formatOfferDate, offerTotalCents, type OfferLine } from "./quote";
import { greetingFor } from "./salutation";

export const SYSTEM_CHECK_NUMBER = "R-TEST-0000";
export const SYSTEM_CHECK_TITLE = "Testrechnung";
export const SYSTEM_CHECK_BUYER = "Testempfänger";
/** Liegt absichtlich weit über echten Rechnungsnummern und wird nicht verbucht. */
export const SYSTEM_CHECK_STRIPE_INVOICE_ID = 990001;
export const SYSTEM_CHECK_FOOTER =
  "Systemcheck: Diese Rechnung ist nicht verbucht. Es wird kein Geld abgebucht. Sie können direkt auf diese E-Mail antworten.";
export const SYSTEM_CHECK_SHORT_SUBJECT = "Systemcheck: Testmail";
export const SYSTEM_CHECK_SHORT_FOOTER =
  "Systemcheck: Es ist nichts zu zahlen. Sie können direkt auf diese E-Mail antworten.";

const TEST_LINES: OfferLine[] = [{ label: "Testposition", quantity: 1, unit: "pauschal", unitCents: 12750 }];

export function parseTestRecipient(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 200) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return null;
  return email;
}

/** Ein Zahlungslink entsteht nur im Stripe-Testmodus, damit im Live-Betrieb nichts abgebucht wird. */
export function systemCheckMayLink(mode: "test" | "live" | "off"): boolean {
  return mode === "test";
}

export function systemCheckShortText(): string {
  return [
    "Das ist eine Testmail aus dem Systemcheck.",
    "",
    "Der Versand funktioniert. Es ist keine Rechnung und es ist nichts zu zahlen.",
  ].join("\n");
}

export function systemCheckDraft(today = berlinTodayIso()): ParsedInvoice & { number: string } {
  const dueDate = addIsoDays(today, 14);
  return {
    number: SYSTEM_CHECK_NUMBER,
    title: SYSTEM_CHECK_TITLE,
    intro: INVOICE_DEFAULT_INTRO,
    lines: TEST_LINES,
    invoiceDate: today,
    serviceDate: today,
    dueDate,
    priceCents: offerTotalCents(TEST_LINES),
  };
}

export function renderSystemCheckPdf(input: {
  today: string;
  taxNumber: string;
  buyerEmail: string;
  authorName: string;
}): { filename: string; bytes: Uint8Array; invoice: ParsedInvoice; number: string } {
  const draft = systemCheckDraft(input.today);
  const invoice: ParsedInvoice = {
    title: draft.title,
    intro: draft.intro,
    lines: draft.lines,
    invoiceDate: draft.invoiceDate,
    serviceDate: draft.serviceDate,
    dueDate: draft.dueDate,
    priceCents: draft.priceCents,
  };
  const bytes = buildInvoicePdf({
    number: draft.number,
    invoiceDateLabel: formatOfferDate(draft.invoiceDate),
    serviceDateLabel: formatOfferDate(draft.serviceDate),
    dueDateLabel: formatOfferDate(draft.dueDate),
    taxNumber: input.taxNumber,
    buyerName: SYSTEM_CHECK_BUYER,
    buyerEmail: input.buyerEmail,
    buyerStreet: SELLER.street,
    buyerPostalCode: SELLER.postalCode,
    buyerCity: SELLER.city,
    title: draft.title,
    greeting: greetingFor("herren_damen", SYSTEM_CHECK_BUYER),
    intro: draft.intro,
    lines: draft.lines,
    invoiceDate: draft.invoiceDate,
    serviceDate: draft.serviceDate,
    dueDate: draft.dueDate,
    authorName: input.authorName,
  });
  return { filename: `Rechnung-${draft.number}.pdf`, bytes, invoice, number: draft.number };
}

export function systemCheckSentMessage(input: {
  kind: "kurz" | "rechnung";
  to: string;
  mode: "test" | "live" | "off";
  link: boolean;
  linkFailed: boolean;
}): string {
  if (input.kind === "kurz") return `Die Testmail ist an ${input.to} raus.`;
  const base = `Die Testrechnung ist an ${input.to} raus. Sie ist nicht verbucht.`;
  if (input.link) return `${base} Der Zahlungsknopf ist ein Testlink, es wird nichts abgebucht.`;
  if (input.linkFailed) return `${base} Der Zahlungslink konnte nicht angelegt werden.`;
  if (input.mode === "live") return `${base} Im Live-Betrieb gibt es keinen Zahlungsknopf.`;
  return `${base}`;
}
