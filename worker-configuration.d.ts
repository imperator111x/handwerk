/// <reference types="@cloudflare/workers-types" />

// Platzhalter-Typen, bis `npx wrangler types` nach dem Hinzufügen von Bindings
// die echten Typen in `.wrangler/types/runtime.d.ts` generiert.
//
// Diese Datei spiegelt die geplanten Umgebungsvariablen und Bindings aus
// `wrangler.jsonc` wider, damit das Projekt bereits strikt typisiert bleibt,
// bevor D1/KV im Dashboard angelegt wurden.

interface Env {
  // Index-Signatur, damit dieses Env an den Astro-Cloudflare-Handler
  // (`handle`) übergeben werden kann.
  [key: string]: unknown;

  // Variablen aus `wrangler.jsonc` -> vars
  SITE_NAME: string;
  SITE_URL: string;
  ADMIN_USERNAME: string;
  CONTACT_FROM_EMAIL: string;
  REPLY_DOMAIN: string;
  TURNSTILE_SITEKEY: string;
  TURNSTILE_PAGE_SITEKEY: string;
  TURNSTILE_HOSTNAMES: string;
  VAPID_PUBLIC_KEY?: string;

  // Secrets (per `wrangler secret put ...` zu setzen)
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
  CONTACT_TO_EMAIL?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET?: string;
  TURNSTILE_PAGE_SECRET?: string;
  VAPID_PRIVATE_JWK?: string;

  // Static Assets Fetcher (automatisch durch `assets.binding` erzeugt)
  ASSETS: Fetcher;

  // Optionale Ressourcen (nach `wrangler d1 create` / `wrangler kv namespace create`
  // in wrangler.jsonc aktivieren)
  DB?: D1Database;
  SESSIONS?: KVNamespace;

  // Cloudflare Email Sending (nach `wrangler email sending enable zeus-service.de`
  // oder Dashboard-Onboarding + Binding in wrangler.jsonc)
  EMAIL?: SendEmail;
}

interface SendEmailAddress {
  email: string;
  name?: string;
}

interface SendEmailAttachment {
  content: string | ArrayBuffer | ArrayBufferView;
  filename: string;
  type: string;
  disposition: "attachment" | "inline";
  contentId?: string;
}

interface SendEmailMessageBuilder {
  to: string | SendEmailAddress | (string | SendEmailAddress)[];
  from: string | SendEmailAddress;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | SendEmailAddress | (string | SendEmailAddress)[];
  bcc?: string | SendEmailAddress | (string | SendEmailAddress)[];
  replyTo?: string | SendEmailAddress;
  attachments?: SendEmailAttachment[];
  headers?: Record<string, string>;
}

interface SendEmailResult {
  messageId: string;
}

/**
 * Shape des `env.EMAIL`-Bindings (Cloudflare Email Sending).
 * Siehe https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 */
interface SendEmail {
  send(message: SendEmailMessageBuilder): Promise<SendEmailResult>;
}
