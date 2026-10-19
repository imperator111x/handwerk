const PERSON_NAME = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;

/** Bereinigter Vor- oder Nachname, oder null wenn er nicht als Personenname taugt. */
export function cleanPersonName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 60) return null;
  if (!PERSON_NAME.test(name)) return null;
  return name;
}

/**
 * Signaturzeile unter „Mit freundlichen Grüßen“.
 * Ohne hinterlegten Namen bleibt der Benutzername stehen.
 */
export function formatUserSignature(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback = "",
): string {
  const full = [firstName, lastName]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return full || fallback.trim();
}
