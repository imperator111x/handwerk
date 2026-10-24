/**
 * Einfacher Text-Filter für Kontaktanfragen und neue Mail-Anfragen.
 * Treffer werden still verworfen (wie gesperrte Absender).
 */

const SPAM_PATTERNS: RegExp[] = [
  /\bgewonnen\b/i,
  /\bgewinnspiel\b/i,
  /\bspende\b/i,
  /\bspenden\b/i,
  /\bspendenaufruf\b/i,
];

export function contactSpamHaystack(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

/** True, wenn Name/Betreff/Nachricht typische Spam-Wörter enthält. */
export function isContactSpam(...parts: Array<string | null | undefined>): boolean {
  const text = contactSpamHaystack(parts);
  if (!text) return false;
  return SPAM_PATTERNS.some((pattern) => pattern.test(text));
}

export function contactSpamReason(...parts: Array<string | null | undefined>): string | null {
  const text = contactSpamHaystack(parts);
  if (!text) return null;
  for (const pattern of SPAM_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[0]) return match[0].toLowerCase();
  }
  return null;
}
