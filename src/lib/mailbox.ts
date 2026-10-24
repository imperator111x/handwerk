export const MAIL_DOMAIN = "zeus-service.de";
export const MAX_MAILBOXES = 30;

const RESERVED = new Set([
  "postmaster",
  "abuse",
  "mailer-daemon",
  "noreply",
  "no-reply",
  "website",
  "info",
]);

/** Adressen, die außerhalb des Panels als normales Postfach laufen. */
const EXTERNAL = new Set(["info"]);

const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function cleanLocalPart(raw: string): string | null {
  const local = raw.trim().toLowerCase();
  if (local.length < 2 || local.length > 64) return null;
  if (!LOCAL_PART.test(local)) return null;
  if (local.includes("..") || local.includes("+")) return null;
  if (local.startsWith("r+") || RESERVED.has(local)) return null;
  return local;
}

export function localPartFromName(firstName: string, lastName: string): string | null {
  const fold = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "");
  const first = fold(firstName);
  const last = fold(lastName);
  if (!first || !last) return null;
  return cleanLocalPart(`${first}.${last}`);
}

export function isExternalLocalPart(localPart: string): boolean {
  return EXTERNAL.has(localPart.trim().toLowerCase());
}

export function isExternalMailboxAddress(address: string, domain = MAIL_DOMAIN): boolean {
  const local = matchMailboxLocalPart([address], domain);
  return local != null && isExternalLocalPart(local);
}

export function mailboxAddress(localPart: string, domain = MAIL_DOMAIN): string {
  return `${localPart}@${domain.replace(/^@/, "")}`;
}

export function canOpenMailbox(
  session: { role?: string; userId?: number },
  mailbox: { memberIds: number[] },
): boolean {
  if (session.role === "admin") return true;
  return session.userId != null && mailbox.memberIds.includes(session.userId);
}

/** info@ bleibt. Jede andere sichtbare Adresse darf weg, samt Verläufen. */
export function canDeleteMailbox(
  session: { role?: string; userId?: number },
  mailbox: { local_part: string; memberIds: number[] },
): boolean {
  if (isExternalLocalPart(mailbox.local_part)) return false;
  return canOpenMailbox(session, mailbox);
}

export function mailboxOwnerLabel(mailbox: { memberNames: string }): string {
  const names = mailbox.memberNames.trim();
  return names || "Nicht zugeordnet";
}

/** Name, den der Empfänger vor der Absenderadresse sieht. Leer fällt auf den bisherigen Namen zurück. */
export function senderDisplayName(raw: string, fallback: string): string {
  const clean = (value: string) =>
    value
      .replace(/[\u0000-\u001f\u007f<>"]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  return clean(raw) || clean(fallback) || "Zeus-Service";
}

export function cleanRecipient(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 200 || email.includes(",") || email.includes(";")) return null;
  if (!EMAIL.test(email)) return null;
  return email;
}

/** Erste normale Empfängeradresse auf der eigenen Domain, ohne signierte Antwortadressen. */
export function matchMailboxLocalPart(
  recipients: Array<string | null | undefined>,
  domain = MAIL_DOMAIN,
): string | null {
  const host = domain.replace(/^@/, "").toLowerCase();
  for (const value of recipients) {
    if (!value) continue;
    for (const part of value.split(/[,\s]+/)) {
      const cleaned = part.replace(/[<>"']/g, "").trim().toLowerCase();
      const at = cleaned.lastIndexOf("@");
      if (at < 1) continue;
      if (cleaned.slice(at + 1) !== host) continue;
      const local = cleaned.slice(0, at);
      if (!local || local.startsWith("r+") || local.includes("+")) continue;
      if (!LOCAL_PART.test(local) || local.includes("..")) continue;
      return local;
    }
  }
  return null;
}
