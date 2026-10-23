import {
  SELLER,
  invoiceNumber,
  reminderStageLabel,
  type ReminderLevel,
} from "./invoice";
import type { InvoiceRow } from "./invoices";
import {
  OFFER_TAX_NOTE,
  OFFER_UNIT_LABELS,
  formatEuro,
  formatOfferDate,
  formatQuantity,
  lineTotalCents,
  readStoredOffer,
  type StoredOffer,
} from "./quote";
import { formatBerlin } from "./time";

/** Textpaket für Online-Mahnantrag / Gericht / Inkasso. */
export function buildMahnverfahrenText(input: {
  row: InvoiceRow;
  stored: StoredOffer;
  today: string;
}): { filename: string; text: string } {
  const { row, stored, today } = input;
  const number = invoiceNumber(row.id, row.invoice_date);
  const amount = formatEuro(row.price_cents);
  const amountPlain = (row.price_cents / 100).toFixed(2).replace(".", ",");
  const stage = reminderStageLabel(row.reminder_level);
  const lines = stored.lines
    .map(
      (line, index) =>
        `${index + 1}. ${line.label}: ${formatQuantity(line.quantity)} ${OFFER_UNIT_LABELS[line.unit]} × ${formatEuro(line.unitCents)} = ${formatEuro(lineTotalCents(line))}`,
    )
    .join("\n");

  const claimText = [
    `Werklohn-/Dienstleistungsforderung aus Rechnung ${number}`,
    `vom ${formatOfferDate(row.invoice_date)}`,
    `für: ${row.title}`,
    `Leistungsdatum: ${formatOfferDate(row.service_date)}`,
    `fällig seit: ${formatOfferDate(row.due_date)}`,
    `offener Betrag: ${amount}`,
    OFFER_TAX_NOTE,
  ].join("; ");

  const text = [
    "ZEUS-SERVICE · Datenpaket für gerichtliches Mahnverfahren / Inkasso",
    "Hinweis: Ausfüllhilfe für https://www.online-mahnantrag.de – keine Rechtsberatung.",
    `Erstellt am: ${formatOfferDate(today)}`,
    "",
    "========== ANTRAGSTELLER (Gläubiger) ==========",
    `Name / Firma: ${SELLER.tradeName}`,
    `Person: ${SELLER.personName}`,
    `Straße: ${SELLER.street}`,
    `PLZ Ort: ${SELLER.postalCode} ${SELLER.city}`,
    `Land: ${SELLER.country}`,
    `Telefon: ${SELLER.phone}`,
    `E-Mail: ${SELLER.email}`,
    `Steuernummer: ${row.tax_number}`,
    `IBAN: ${SELLER.iban}`,
    `BIC: ${SELLER.bic}`,
    `Kontoinhaber: ${SELLER.accountName}`,
    "",
    "========== ANTRAGSGEGNER (Schuldner) ==========",
    `Name: ${row.buyer_name}`,
    `Straße: ${row.buyer_street}`,
    `PLZ Ort: ${row.buyer_postal_code} ${row.buyer_city}`,
    `Land: DE`,
    `E-Mail: ${row.buyer_email}`,
    `Telefon: ${row.buyer_phone?.trim() || "—"}`,
    "",
    "========== HAUPTFORDERUNG ==========",
    `Betrag (EUR): ${amountPlain}`,
    `Betrag formatiert: ${amount}`,
    `Währung: EUR`,
    `Rechnungsnummer: ${number}`,
    `Rechnungsdatum: ${formatOfferDate(row.invoice_date)}`,
    `Leistungsdatum: ${formatOfferDate(row.service_date)}`,
    `Fälligkeitsdatum: ${formatOfferDate(row.due_date)}`,
    `Betreff / Leistung: ${row.title}`,
    "",
    "Kurztext für den Mahnantrag (Anspruchsgrund):",
    claimText,
    "",
    "========== ZINSEN / NEBENFORDERUNGEN ==========",
    "Vorschlag im Online-Mahnantrag:",
    `- Verzugszinsen ab ${formatOfferDate(row.due_date)} (Fälligkeit) bis zur Zahlung`,
    "- Zinssatz: gesetzliche Verzugszinsen (Basiszinssatz + 5 Prozentpunkte bei Verbrauchern,",
    "  bzw. Basiszinssatz + 9 Prozentpunkte bei Unternehmern – im Formular auswählen)",
    "- Weitere Nebenforderungen nur eintragen, wenn sie konkret entstanden und belegt sind",
    "",
    "========== MAHNVERLAUF (intern) ==========",
    `Zahlungsstatus: ${row.payment_status}`,
    `Mahnstufe: ${stage} (Stufe ${Number(row.reminder_level ?? 0)})`,
    `Rechnung gesendet: ${row.sent_at ? formatBerlin(row.sent_at) : "—"}`,
    `Zuletzt erinnert/gemahnt: ${row.reminded_at ? formatBerlin(row.reminded_at) : "—"}`,
    `E-Mail-Status: ${row.email_status ?? "—"}`,
    row.payment_note ? `Zahlungsnotiz: ${row.payment_note}` : null,
    "",
    "========== POSITIONEN ==========",
    lines || "(keine Positionen)",
    "",
    stored.greeting ? `Anrede in der Rechnung: ${stored.greeting}` : null,
    stored.intro ? `Einleitung:\n${stored.intro}` : null,
    "",
    "========== ANLAGEN IN DIESEM ZIP ==========",
    `- Rechnung-PDF (${number})`,
    Number(row.reminder_level ?? 0) >= 1 ? "- Mahnung-/Erinnerungs-PDF (falls vorhanden)" : null,
    "- Diese Datei: Mahnverfahren-Daten.txt",
    "",
    "========== NÄCHSTE SCHRITTE ==========",
    "1. https://www.online-mahnantrag.de öffnen",
    "2. Antragsteller- und Antragsgegner-Daten oben übernehmen",
    "3. Hauptforderung und Anspruchsgrund eintragen",
    "4. Zinsen ab Fälligkeit wählen",
    "5. Rechnung-PDF als Beleg bereithalten (Upload oft erst später / auf Nachfrage)",
    "",
  ]
    .filter((line) => line != null)
    .join("\n");

  return { filename: `Mahnverfahren-${number}.txt`, text };
}

export function mahnverfahrenZipName(row: InvoiceRow): string {
  return `Gericht-${invoiceNumber(row.id, row.invoice_date)}.zip`;
}

export function reminderNoticeKind(
  level: number | null | undefined,
): "erinnerung" | "mahnung" | "inkasso" | null {
  const n = Number(level ?? 0) as ReminderLevel | 0;
  if (n >= 3) return "inkasso";
  if (n >= 2) return "mahnung";
  if (n >= 1) return "erinnerung";
  return null;
}
