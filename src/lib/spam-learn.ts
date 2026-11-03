/**
 * Gelernte Spam-Signale (E-Mail, Domain, Phrase) – gespeichert in D1.
 * Domains von Free-Webmailern werden nicht gelernt (zu breit).
 */

const FREE_WEBMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "gmx.de",
  "gmx.net",
  "web.de",
  "outlook.com",
  "outlook.de",
  "hotmail.com",
  "hotmail.de",
  "yahoo.com",
  "yahoo.de",
  "icloud.com",
  "me.com",
  "mail.de",
  "proton.me",
  "protonmail.com",
  "aol.com",
]);

export type SpamSignalKind = "email" | "domain" | "phrase";

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : "";
}

function normalizePhrase(raw: string): string | null {
  const text = raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 160);
  if (text.length < 16 || text.length > 160) return null;
  return text;
}

/** Speichert Absender + ggf. Domain + kurze Phrase aus der Nachricht. */
export async function learnFromSpamRequest(
  db: D1Database,
  input: {
    email: string;
    message?: string | null;
    subject?: string | null;
    reason?: string | null;
    note?: string | null;
  },
): Promise<{ email: boolean; domain: boolean; phrase: boolean }> {
  const saved = { email: false, domain: false, phrase: false };
  const email = input.email.trim().toLowerCase();
  const note = (input.note ?? input.reason ?? "manuell als Spam").slice(0, 160);

  if (email.includes("@")) {
    await db
      .prepare(
        `INSERT INTO spam_signals (kind, value, note) VALUES ('email', ?, ?)
         ON CONFLICT(kind, value) DO NOTHING`,
      )
      .bind(email, note)
      .run();
    saved.email = true;

    const domain = emailDomain(email);
    if (domain && !FREE_WEBMAIL_DOMAINS.has(domain)) {
      await db
        .prepare(
          `INSERT INTO spam_signals (kind, value, note) VALUES ('domain', ?, ?)
           ON CONFLICT(kind, value) DO NOTHING`,
        )
        .bind(domain, note)
        .run();
      saved.domain = true;
    }
  }

  const phraseSource = [input.subject, input.message].filter(Boolean).join(" ").trim();
  const phrase = normalizePhrase(phraseSource.split(/\n/)[0] ?? phraseSource);
  if (phrase) {
    await db
      .prepare(
        `INSERT INTO spam_signals (kind, value, note) VALUES ('phrase', ?, ?)
         ON CONFLICT(kind, value) DO NOTHING`,
      )
      .bind(phrase, note)
      .run();
    saved.phrase = true;
  }

  return saved;
}

/** Treffer gegen gelernte Signale; liefert kind:value oder null. */
export async function matchLearnedSpam(
  db: D1Database,
  input: { email?: string | null; message?: string | null; subject?: string | null },
): Promise<string | null> {
  const email = (input.email ?? "").trim().toLowerCase();
  const domain = emailDomain(email);
  const haystack = [input.subject, input.message, email]
    .map((part) => (part ?? "").toLowerCase())
    .join("\n");

  if (email) {
    const hit = await db
      .prepare(`SELECT value FROM spam_signals WHERE kind = 'email' AND value = ? LIMIT 1`)
      .bind(email)
      .first<{ value: string }>();
    if (hit) return `learned:email`;
  }

  if (domain) {
    const hit = await db
      .prepare(`SELECT value FROM spam_signals WHERE kind = 'domain' AND value = ? LIMIT 1`)
      .bind(domain)
      .first<{ value: string }>();
    if (hit) return `learned:domain`;
  }

  const { results } = await db
    .prepare(`SELECT value FROM spam_signals WHERE kind = 'phrase' ORDER BY id DESC LIMIT 200`)
    .all<{ value: string }>();
  for (const row of results ?? []) {
    if (row.value && haystack.includes(row.value)) return `learned:phrase`;
  }

  return null;
}
