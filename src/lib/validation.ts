/**
 * Kleine, dependency-freie Helfer für Formular-Validierung.
 * Ersetzt zod für die wenigen Felder und bleibt so edge-schlank.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactPayload {
  name: string;
  email: string;
  phone?: string;
  topic: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export function parseContact(form: FormData): ValidationResult<ContactPayload> {
  const honeypot = String(form.get("website") ?? "").trim();
  if (honeypot) {
    return { ok: false, error: "Ungültige Anfrage." };
  }

  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const topic = String(form.get("topic") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();
  const privacy = form.get("privacy");

  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: "Bitte geben Sie einen gültigen Namen an." };
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return { ok: false, error: "Bitte geben Sie eine gültige E-Mail-Adresse an." };
  }
  if (phone.length > 60) {
    return { ok: false, error: "Die Telefonnummer ist zu lang." };
  }
  if (topic.length === 0 || topic.length > 60) {
    return { ok: false, error: "Bitte wählen Sie ein Thema aus." };
  }
  if (message.length < 10 || message.length > 5000) {
    return {
      ok: false,
      error: "Bitte schildern Sie Ihr Anliegen etwas ausführlicher (min. 10 Zeichen).",
    };
  }
  if (!privacy) {
    return {
      ok: false,
      error:
        "Bitte bestätigen Sie, dass Sie der Datenverarbeitung zugestimmt haben.",
    };
  }

  return {
    ok: true,
    value: {
      name,
      email,
      phone: phone || undefined,
      topic,
      message,
    },
  };
}
