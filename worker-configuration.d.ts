/// <reference types="@cloudflare/workers-types" />

// Platzhalter-Typen, bis `npx wrangler types` nach dem Hinzufügen von Bindings
// die echten Typen in `.wrangler/types/runtime.d.ts` generiert.
//
// Diese Datei spiegelt die geplanten Umgebungsvariablen und Bindings aus
// `wrangler.jsonc` wider, damit das Projekt bereits strikt typisiert bleibt,
// bevor D1/KV im Dashboard angelegt wurden.

interface Env {
  // Variablen aus `wrangler.jsonc` -> vars
  SITE_NAME: string;
  SITE_URL: string;
  ADMIN_USERNAME: string;
  CONTACT_FROM_EMAIL: string;

  // Secrets (per `wrangler secret put ...` zu setzen)
  ADMIN_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
  CONTACT_TO_EMAIL?: string;
  RESEND_API_KEY?: string;

  // Static Assets Fetcher (automatisch durch `assets.binding` erzeugt)
  ASSETS: Fetcher;

  // Optionale Ressourcen (nach `wrangler d1 create` / `wrangler kv namespace create`
  // in wrangler.jsonc aktivieren)
  DB?: D1Database;
  SESSIONS?: KVNamespace;
}
