/**
 * Leichtgewichtiger Spam-Filter für Kontaktformular und neue Mail-Anfragen.
 * Heuristik (Muster) + Disposable-Domain-Blacklist (Community-Liste, gecacht).
 * Treffer werden still verworfen (wie gesperrte Absender).
 */

import { isDisposableEmail } from "./disposable-domains";

export type ContactSpamInput = {
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  topic?: string | null;
  message?: string | null;
};

/** Ein Treffer reicht – typische Scam-/Phishing-Wörter und -Phrasen (DE/EN). */
const HARD_PATTERNS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: "gewonnen", re: /\bgewonnen\b/i },
  { id: "gewinnspiel", re: /\bgewinnspiel\b/i },
  { id: "glueckwunsch-gewinn", re: /\bherzlichen\s+gl[uü]ckwunsch\b.{0,40}\bgewinn/i },
  { id: "spende", re: /\bspenden?(?:aufruf|aktion|kampagne)?\b/i },
  {
    id: "donation-scam",
    re: /\b(?:donation\s+sum|community\s+donation|humanitarian\s+(?:community\s+)?donation|awarded\s+a\s+donation|congratulation[s]?[\s\S]{0,80}(?:donation|awarded|million))\b/i,
  },
  {
    id: "sos-village-scam",
    re: /\bsos\s*children'?s?\s*village|\bsoschildrensvillage\b/i,
  },
  { id: "kredit-zins", re: /\bkredit(?:e|angebote?)?\b[\s\S]{0,120}\bzins(?:satz|en)?\b|\bzins(?:satz)?\b[\s\S]{0,120}\bkredit/i },
  { id: "serioeser-kredit", re: /\bseri[oö]sen?\s+kredit/i },
  {
    id: "prime-brand",
    re: /\bamazon\s+prime\b|\bprime\s*video\b|\bprime[\s-]?vorteile\b|\bprime[\s-]?mitglied(?:schaft)?\b/i,
  },
  { id: "netflix-phishing", re: /\bnetflix\b[\s\S]{0,80}\b(?:abo|mitglied|kündig|zahlung|konto|verifiz)/i },
  { id: "paypal-phishing", re: /\bpaypal\b[\s\S]{0,80}\b(?:verifiz|bestätig|gesperrt|konto|zahlung|sicherheit)/i },
  { id: "apple-id-phishing", re: /\bapple[\s-]?id\b[\s\S]{0,80}\b(?:gesperrt|verifiz|sicherheit|konto)/i },
  { id: "dhl-paket-phishing", re: /\b(?:dhl|hermes|dpd|ups)\b[\s\S]{0,60}\b(?:zoll|nachgebühr|paket.*nicht|zustell)/i },
  {
    id: "banking-phishing",
    re: /\bonline[\s-]?banking\b[\s\S]{0,120}\b(?:aktualis|reaktiv|verifiz|freischalt|sicherheits(?:update|prüfung)|anti[\s-]?phishing)/i,
  },
  {
    id: "banking-login-cta",
    re: /\b(?:loggen\s+sie\s+sich|jetzt\s+reaktivieren|konto\s+freischalten)\b[\s\S]{0,80}\b(?:online[\s-]?banking|bank|konto)\b|\banti[\s-]?phishing[\s-]?programm\b/i,
  },
  {
    id: "renten-phishing",
    re: /\brenteninformation\b|\bdeutsche\s+rentenversicherung\b|\brentenanwartschaft(?:en)?\b|\bversichertenportal\b|\bversicherungsnummer\b[\s\S]{0,80}\bzahlungsmittel\b|\bversandpauschale\b/i,
  },
  {
    id: "behoerden-gebuehr",
    re: /\b(?:einschreiben|postweg|zustellung)\b[\s\S]{0,80}\b(?:versandpauschale|bearbeitungsgeb[uü]hr|\d+[.,]\d{2}\s*€)/i,
  },
  { id: "crypto-wallet", re: /\b(?:bitcoin|btc|crypto|wallet|seed[\s-]?phrase|metamask)\b/i },
  { id: "seo-outreach", re: /\b(?:guest\s*post|backlink|linkbuilding|seo[\s-]?optim)/i },
  { id: "bulk-positionen", re: /\bverfügbare[n]?\s+positionen\b/i },
  {
    id: "un-compensation",
    re: /\bunited\s+nations\s+compensation\b|\buncco?\b|\buncc\b|\bentsch[aä]digungs(?:zahlung(?:en)?|programm|kommission)\b|\bvereinten?\s+nationen\b[\s\S]{0,120}\bentsch[aä]dig|\bbeg[uü]nstigte\(r\)\b|\banspruchsberechtigt(?:er|e|en)?\s+empf[aä]nger\b/i,
  },
  {
    id: "botschafter-scam",
    re: /\b(?:deutscher?\s+)?botschafter\b[\s\S]{0,80}\b(?:vereinten?\s+nationen|united\s+nations|entsch[aä]dig|auszahlung)\b/i,
  },
  {
    id: "nigerian-transfer",
    // „3 Million Euro“ und „3.500.000 Euro“ / „3,500,000 USD“
    re: /\b(?:\d[\d.,]*\s*)?million(?:en)?\s*(?:usd|us\$|eur(?:o)?s?|\$|€)\b|\b\d{1,3}(?:[.,]\d{3}){2,}\s*(?:usd|us\$|eur(?:o)?s?|\$|€)\b|\berbberechtigt\b|\bfondsfreigabe\b|\bwestern\s*union\b/i,
  },
  { id: "viagra", re: /\b(?:viagra|cialis|phentermine|casino)\b/i },
  {
    id: "schreib-das-fuer-mich",
    re: /\bschreib(?:en)?\s+(?:sie\s+)?das\s+bitte\s+f[uü]r\s+mich\b|\bwrite\s+this\s+(?:down\s+)?for\s+me\b/i,
  },
];

/** Kurze Mails ohne Handwerks-Bezug = oft Probe-/Junk-Spam. */
const SERVICE_HINT =
  /\b(?:hausmeister|reparatur|heizung|rolladen|rollladen|angebot|wohnung|objekt|reinigung|wartung|garten|keller|dach|wasser|strom|termin|schl[uü]ssel|t[uü]r|fenster|umzug|entr[uü]mpel|balkon|fassade|r[aä]umung|handwerk|gewerbe|eigent[uü]mer|mieter|hausverwaltung|heating|repair|apartment|cleaning|maintenance|garden|plumber|electrician|handyman|landlord|tenant)\b/i;
/** Typische DE/AT/CH-Signale (Sprache), damit echte Kurzmails nicht geblockt werden. */
const GERMAN_HINT =
  /[äöüß]|\b(?:bitte|danke|hallo|guten\s+tag|sehr\s+geehrte|anfrage|anrufen|r[uü]ckruf|termin|heute|morgen|dringend|kaputt|defekt|und|ich|wir|mein|unsere?|f[uü]r|nicht|kann|m[oö]chten?|h[aä]tten?)\b/i;
const DACH_EMAIL = /\.(?:de|at|ch)(?:$|>)/i;
const FREE_WEBMAIL = /@(?:gmail|googlemail|gmx|web|outlook|hotmail|yahoo|icloud|mail|proton|aol)\./i;
const SHORT_JUNK_MAX = 60;
const LANGUAGE_GATE_MIN = 50;

/**
 * Weiche Signale – erst ab Schwellwert Spam.
 * Hält False Positives niedrig (z. B. echtes „Abo“ in einer Anfrage).
 */
const SOFT_PATTERNS: ReadonlyArray<{ id: string; re: RegExp; weight: number }> = [
  { id: "testphase", re: /\btestphase\b/i, weight: 1 },
  { id: "mitgliedschaft-tarif", re: /\bmitgliedschaft\b[\s\S]{0,80}\btarif\b|\btarif\b[\s\S]{0,80}\bmitglied/i, weight: 2 },
  { id: "abo-preis", re: /\b\d+[.,]\d{2}\s*€\b[\s\S]{0,40}\b(?:monat|monate|halbjahr|jahr)/i, weight: 1 },
  { id: "zahlungsmethoden", re: /\bzahlungsmethoden?\s+verwalten\b/i, weight: 2 },
  { id: "konto-uebersicht", re: /\b(?:übersicht\s+einsehen|abonnement\s+verwalten)\b/i, weight: 1 },
  { id: "unsubscribe-footer", re: /\babmelden\b[\s\S]{0,40}\b(?:datenschutz|kommunikationseinstellung)/i, weight: 1 },
  { id: "unternehmen-id-hash", re: /\buntern(?:ehmen|ehme(?:n|ns)?)-?id\b[\s\S]{0,20}\b[a-f0-9]{8,}\b/i, weight: 1 },
  { id: "urgency-account", re: /\b(?:sofort|innerhalb\s+von\s+\d+\s*stunden).{0,40}\b(?:konto|zugang|gesperrt)\b/i, weight: 2 },
];

const SOFT_THRESHOLD = 3;

/** Absenderdomains, die als „Kunde“ praktisch nie legitim sind. */
const SUSPICIOUS_EMAIL_DOMAINS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: "amazonses", re: /@amazonses\.com$/i },
  { id: "mailgun", re: /@(?:mailgun\.(?:org|com)|mg\.)/i },
  { id: "sendgrid", re: /@sendgrid\.(?:net|com)$/i },
  { id: "noreply-bulk", re: /^(?:no-?reply|noreply|mailer-daemon|bounce)@/i },
];

/** Markenname im Absender-/Anzeigenamen, aber Domain passt nicht zur Marke. */
const BRAND_IMPERSONATION: ReadonlyArray<{
  id: string;
  nameRe: RegExp;
  allowedDomains: RegExp;
}> = [
  {
    id: "brand-prime",
    nameRe: /\bprime\s*video\b|\bamazon\s*prime\b/i,
    allowedDomains: /(?:^|\.)amazon\./i,
  },
  {
    id: "brand-netflix",
    nameRe: /\bnetflix\b/i,
    allowedDomains: /(?:^|\.)netflix\./i,
  },
  {
    id: "brand-paypal",
    nameRe: /\bpaypal\b/i,
    allowedDomains: /(?:^|\.)paypal\./i,
  },
  {
    id: "brand-apple",
    nameRe: /\bapple\b/i,
    allowedDomains: /(?:^|\.)apple\./i,
  },
  {
    id: "brand-dhl",
    nameRe: /\bdhl\b/i,
    allowedDomains: /(?:^|\.)dhl\./i,
  },
  {
    id: "brand-volksbank",
    nameRe: /\bvolksbank\b|\braiffeisenbank\b|\bvr[\s-]?bank\b/i,
    allowedDomains: /(?:^|\.)(?:volksbank|raiffeisen|vr)\./i,
  },
  {
    id: "brand-sparkasse",
    nameRe: /\bsparkasse\b/i,
    allowedDomains: /(?:^|\.)sparkasse\./i,
  },
  {
    id: "brand-commerzbank",
    nameRe: /\bcommerzbank\b/i,
    allowedDomains: /(?:^|\.)commerzbank\./i,
  },
  {
    id: "brand-deutsche-bank",
    nameRe: /\bdeutsche\s+bank\b/i,
    allowedDomains: /(?:^|\.)(?:db|deutsche-bank)\./i,
  },
  {
    id: "brand-postbank",
    nameRe: /\bpostbank\b/i,
    allowedDomains: /(?:^|\.)postbank\./i,
  },
  {
    id: "brand-drv",
    nameRe: /\bdeutsche\s+rentenversicherung\b|\brentenversicherung\b/i,
    allowedDomains: /(?:^|\.)deutsche-rentenversicherung\./i,
  },
  {
    id: "brand-elster",
    nameRe: /\belster\b|\bfinanzamt\b|\bbundesfinanz/i,
    allowedDomains: /(?:^|\.)(?:elster|bundesfinanzministerium|finanzamt)\./i,
  },
  {
    id: "brand-un",
    nameRe: /\bunited\s+nations\b|\bvereinten?\s+nationen\b|\buncco?\b|\buncc\b/i,
    allowedDomains: /(?:^|\.)(?:un\.org|unitednations)\./i,
  },
];

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).toLowerCase() : "";
}

export function contactSpamHaystack(parts: Array<string | null | undefined>): string {
  return normalize(
    parts
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join("\n"),
  );
}

function toInput(
  first: ContactSpamInput | string | null | undefined,
  rest: Array<string | null | undefined>,
): ContactSpamInput {
  if (first && typeof first === "object") return first;
  // Variadisch: name, email?, subject/topic, message… – alles landet im Text.
  const parts = [first, ...rest];
  return {
    name: parts[0],
    email: parts.find((p) => typeof p === "string" && p.includes("@")) ?? null,
    message: contactSpamHaystack(parts),
  };
}

/** Synchron: nur Heuristik (ohne externe Blacklist). */
export function contactSpamReason(
  first?: ContactSpamInput | string | null,
  ...rest: Array<string | null | undefined>
): string | null {
  const input = toInput(first, rest);
  const name = normalize(input.name ?? "");
  const email = normalize(input.email ?? "").toLowerCase();
  const text = contactSpamHaystack([
    input.name,
    input.email,
    input.subject,
    input.topic,
    input.message,
  ]);
  if (!text && !email) return null;

  for (const pattern of HARD_PATTERNS) {
    if (pattern.re.test(text)) return pattern.id;
  }

  if (email) {
    for (const pattern of SUSPICIOUS_EMAIL_DOMAINS) {
      if (pattern.re.test(email)) return pattern.id;
    }
  }

  if (name && email) {
    const domain = emailDomain(email);
    for (const brand of BRAND_IMPERSONATION) {
      if (brand.nameRe.test(name) && domain && !brand.allowedDomains.test(domain)) {
        return brand.id;
      }
    }
  }

  const messageOnly = normalize(input.message ?? "");
  if (
    messageOnly &&
    messageOnly.length <= SHORT_JUNK_MAX &&
    !SERVICE_HINT.test(messageOnly) &&
    FREE_WEBMAIL.test(email)
  ) {
    return "short-webmail-junk";
  }

  // Sprach-/Themen-Gate: längerer Text ohne Handwerk UND ohne DE-Signale.
  if (
    messageOnly.length >= LANGUAGE_GATE_MIN &&
    !SERVICE_HINT.test(messageOnly) &&
    !GERMAN_HINT.test(messageOnly) &&
    !DACH_EMAIL.test(email)
  ) {
    return "topic-language-gate";
  }

  let softScore = 0;
  for (const pattern of SOFT_PATTERNS) {
    if (pattern.re.test(text)) {
      softScore += pattern.weight;
      if (softScore >= SOFT_THRESHOLD) return `soft:${pattern.id}`;
    }
  }

  return null;
}

/** Heuristik + Disposable-Domain-Blacklist. */
export async function contactSpamReasonAsync(
  first?: ContactSpamInput | string | null,
  ...rest: Array<string | null | undefined>
): Promise<string | null> {
  const sync = contactSpamReason(first, ...rest);
  if (sync) return sync;
  const input = toInput(first, rest);
  if (await isDisposableEmail(input.email)) return "disposable-domain";
  return null;
}

/** True, wenn Name/E-Mail/Betreff/Nachricht typischen Spam enthält (nur Heuristik). */
export function isContactSpam(
  first?: ContactSpamInput | string | null,
  ...rest: Array<string | null | undefined>
): boolean {
  return contactSpamReason(first, ...rest) !== null;
}

/** Heuristik + Disposable-Blacklist. */
export async function isContactSpamAsync(
  first?: ContactSpamInput | string | null,
  ...rest: Array<string | null | undefined>
): Promise<boolean> {
  return (await contactSpamReasonAsync(first, ...rest)) !== null;
}
