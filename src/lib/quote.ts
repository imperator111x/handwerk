export const OFFER_PAYMENT_TERMS = "Zahlbar innerhalb von 14 Tagen nach Ausführung.";
export const OFFER_BANK_LINES = [
  "Kontoinhaber: ZEUS-SERVICE",
  "IBAN: DE38 1001 4000 1598 1684 18",
  "SWIFT: SWNB DE BB",
] as const;
export const OFFER_SCOPE_NOTE =
  "Der Festpreis gilt für die aufgeführten Positionen. Weitere Arbeiten nur nach Absprache.";
export const OFFER_HOURLY_SCOPE_NOTE =
  "Material, Anfahrt und die übrigen Positionen gelten wie aufgeführt. Der Arbeitslohn wird nach Stunden berechnet. Weitere Arbeiten nur nach Absprache.";
export const OFFER_TAX_NOTE =
  "Hinweis zur Kleinunternehmerregelung: Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";
export const OFFER_DEFAULT_INTRO =
  "für die besprochene Leistung bieten wir Ihnen folgende Positionen zum Festpreis an.";
export const OFFER_HOURLY_INTRO =
  "für die besprochene Leistung bieten wir Ihnen folgende Positionen an. Der Arbeitslohn wird nach Stunden berechnet.";
export const MAX_OFFER_LINES = 12;

export const OFFER_BILLINGS = ["fest", "stunden"] as const;
export type OfferBilling = (typeof OFFER_BILLINGS)[number];

export const OFFER_UNITS = ["stunde", "km", "pauschal", "stueck", "m2", "m"] as const;
export type OfferUnit = (typeof OFFER_UNITS)[number];

export const OFFER_UNIT_LABELS: Record<OfferUnit, string> = {
  stunde: "Std.",
  km: "km",
  pauschal: "pauschal",
  stueck: "Stück",
  m2: "m²",
  m: "m",
};

export interface OfferLine {
  label: string;
  quantity: number;
  unit: OfferUnit;
  unitCents: number;
}

export interface ParsedOffer {
  title: string;
  intro: string;
  lines: OfferLine[];
  validUntil: string;
  priceCents: number;
  billing: OfferBilling;
}

export interface StoredOffer {
  greeting: string | null;
  intro: string;
  lines: OfferLine[];
  billing: OfferBilling;
}

const UNIT_SET = new Set<string>(OFFER_UNITS);

export function parseEuroToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned.replace(",", ".")) * 100);
  if (!Number.isInteger(cents) || cents <= 0 || cents > 10_000_000) return null;
  return cents;
}

export function parseQuantity(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0 || value > 10_000) return null;
  return value;
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatEuroAmount(cents: number): string {
  const amount = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `${amount} EUR`;
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(value);
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

export function formatBerlinDate(unixSeconds: number): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(unixSeconds * 1000));
}

export function offerYear(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
  }).format(new Date(unixSeconds * 1000));
}

export function offerNumber(id: number, unixSeconds: number): string {
  return `A-${offerYear(unixSeconds)}-${String(id).padStart(4, "0")}`;
}

export function isOfferUnit(value: string): value is OfferUnit {
  return UNIT_SET.has(value);
}

export function offerBilling(value: string | null | undefined): OfferBilling {
  return value === "stunden" ? "stunden" : "fest";
}

export function offerTotalLabel(billing: OfferBilling): string {
  return billing === "stunden" ? "Summe" : "Festpreis";
}

export function offerIntroDefault(billing: OfferBilling): string {
  return billing === "stunden" ? OFFER_HOURLY_INTRO : OFFER_DEFAULT_INTRO;
}

export function offerScopeNote(billing: OfferBilling): string {
  return billing === "stunden" ? OFFER_HOURLY_SCOPE_NOTE : OFFER_SCOPE_NOTE;
}

/** Nach Stunden braucht mindestens eine gefüllte Arbeitslohn-Zeile. */
export function hourlyOfferMissingWage(form: FormData): boolean {
  if (offerBilling(String(form.get("billing") ?? "")) !== "stunden") return false;
  const units = form.getAll("line_unit").map((value) => String(value));
  const quantities = form.getAll("line_qty").map((value) => String(value));
  const prices = form.getAll("line_price").map((value) => String(value));
  return !units.some(
    (unit, index) =>
      unit === "stunde" &&
      parseQuantity(quantities[index] ?? "") != null &&
      parseEuroToCents(prices[index] ?? "") != null,
  );
}

export function lineTotalCents(line: OfferLine): number {
  return Math.round(line.quantity * line.unitCents);
}

export function offerTotalCents(lines: OfferLine[]): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

export function parseOfferForm(
  form: FormData,
  today: string,
  options?: { allowPast?: boolean },
): ParsedOffer | null {
  const title = String(form.get("title") ?? "").trim();
  const intro = String(form.get("intro") ?? "").trim();
  const validUntil = String(form.get("valid_until") ?? "").trim();
  if (title.length < 3 || title.length > 120) return null;
  if (intro.length > 2000) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return null;
  if (!options?.allowPast && validUntil < today) return null;
  const span = Date.parse(`${validUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(span) || span > 366 * 86_400_000 || span < -366 * 86_400_000) return null;

  const billing = offerBilling(String(form.get("billing") ?? ""));
  const labels = form.getAll("line_label").map((value) => String(value));
  const quantities = form.getAll("line_qty").map((value) => String(value));
  const units = form.getAll("line_unit").map((value) => String(value));
  const prices = form.getAll("line_price").map((value) => String(value));
  const count = Math.max(labels.length, quantities.length, units.length, prices.length);
  if (count < 1 || count > MAX_OFFER_LINES) return null;

  const lines: OfferLine[] = [];
  for (let index = 0; index < count; index += 1) {
    const label = (labels[index] ?? "").trim();
    const quantityRaw = (quantities[index] ?? "").trim();
    const unitRaw = (units[index] ?? "").trim();
    const priceRaw = (prices[index] ?? "").trim();
    if (!quantityRaw && !priceRaw) continue;
    const quantity = parseQuantity(quantityRaw);
    const unitCents = parseEuroToCents(priceRaw);
    if (label.length < 2 || label.length > 120) return null;
    if (quantity == null || unitCents == null || !isOfferUnit(unitRaw)) return null;
    lines.push({ label, quantity, unit: unitRaw, unitCents });
  }
  if (lines.length < 1) return null;
  if (billing === "stunden" && !lines.some((line) => line.unit === "stunde")) return null;
  const priceCents = offerTotalCents(lines);
  if (priceCents <= 0 || priceCents > 10_000_000) return null;
  return { title, intro, lines, validUntil, priceCents, billing };
}

export function serializeOffer(offer: StoredOffer): string {
  return JSON.stringify({
    greeting: offer.greeting,
    intro: offer.intro,
    lines: offer.lines,
    billing: offer.billing === "stunden" ? "stunden" : "fest",
  });
}

export function readStoredOffer(raw: string | null | undefined, fallbackIntro: string): StoredOffer {
  const empty = { greeting: null, intro: fallbackIntro, lines: [] as OfferLine[], billing: "fest" as OfferBilling };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const source = Array.isArray(parsed)
      ? { greeting: null, intro: fallbackIntro, lines: parsed }
      : parsed && typeof parsed === "object"
        ? (parsed as { greeting?: unknown; intro?: unknown; lines?: unknown; billing?: unknown })
        : null;
    if (!source || !Array.isArray(source.lines)) return empty;
    const lines: OfferLine[] = [];
    for (const entry of source.lines) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { label?: unknown; quantity?: unknown; unit?: unknown; unitCents?: unknown };
      const label = typeof row.label === "string" ? row.label.trim() : "";
      const quantity = typeof row.quantity === "number" ? row.quantity : Number.NaN;
      const unit = typeof row.unit === "string" ? row.unit : "";
      const unitCents = typeof row.unitCents === "number" ? row.unitCents : Number.NaN;
      if (label.length < 2 || !Number.isFinite(quantity) || quantity <= 0) continue;
      if (!isOfferUnit(unit) || !Number.isInteger(unitCents) || unitCents <= 0) continue;
      lines.push({ label, quantity, unit, unitCents });
    }
    const greeting = typeof source.greeting === "string" && source.greeting.trim() ? source.greeting.trim() : null;
    const intro = typeof source.intro === "string" ? source.intro.trim() : fallbackIntro;
    const billing = offerBilling(typeof source.billing === "string" ? source.billing : "");
    return { greeting, intro, lines, billing };
  } catch {
    return empty;
  }
}

export function offerPlainText(input: {
  number: string;
  title: string;
  intro: string;
  lines: OfferLine[];
  validUntil: string;
  billing?: OfferBilling;
}): string {
  const billing = input.billing ?? "fest";
  const rows = input.lines.map((line, index) => {
    const total = lineTotalCents(line);
    return `${index + 1}. ${line.label} — ${formatQuantity(line.quantity)} ${OFFER_UNIT_LABELS[line.unit]} × ${formatEuro(line.unitCents)} = ${formatEuro(total)}`;
  });
  return [
    `Angebot ${input.number}`,
    input.title,
    "",
    input.intro.trim() || offerIntroDefault(billing),
    "",
    ...rows,
    "",
    `${offerTotalLabel(billing)}: ${formatEuro(offerTotalCents(input.lines))}`,
    "",
    OFFER_TAX_NOTE,
    "",
    OFFER_PAYMENT_TERMS,
    "",
    offerScopeNote(billing),
    "",
    `Dieses Angebot ist gültig bis ${formatOfferDate(input.validUntil)}.`,
    "",
    ...OFFER_BANK_LINES,
    "",
    "Das Angebot hängt als PDF an.",
  ].join("\n");
}
