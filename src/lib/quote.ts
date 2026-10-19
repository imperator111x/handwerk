export function parseEuroToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned.replace(",", ".")) * 100);
  if (!Number.isInteger(cents) || cents <= 0 || cents > 10_000_000) return null;
  return cents;
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatOfferDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function offerPlainText(input: {
  title: string;
  body: string;
  priceCents: number;
  validUntil: string;
}): string {
  return [
    input.title,
    "",
    `Festpreis: ${formatEuro(input.priceCents)}`,
    `Gültig bis: ${formatOfferDate(input.validUntil)}`,
    "",
    input.body.trim(),
    "",
    "Der Preis gilt für die beschriebene Leistung.",
  ].join("\n");
}
