# Zeus-Service Website

Neu aufgebaute, verbesserte Version der Website [zeus-service.de](https://zeus-service.de/) –
gehostet auf **Cloudflare Workers**, geschrieben mit **Astro + TypeScript + Tailwind CSS v4**.

Das Projekt enthält:

- Modernes Marketing-Frontend (Hero, Leistungen, Über uns, Ablauf, Referenzen, Kontakt)
- Kontaktformular mit serverseitiger Validierung (Workers API-Route) und optionalem E-Mail-Versand via [Resend](https://resend.com/)
- Vorbereiteten **Admin-Bereich unter `/admin`** mit Login (`/login`), Session-Handling und Platzhalter-Dashboard
- SEO (strukturierte Daten, Open Graph, Sitemap), `robots.txt`, 404-Seite
- Eigene Impressums- und Datenschutz-Stubs

---

## Warum dieser Stack?

| Baustein | Wahl | Warum |
|---|---|---|
| Sprache | **TypeScript** | Standard im Cloudflare- und Astro-Ökosystem, strikte Typsicherheit, direkt in Workers kompatibel. |
| Framework | **[Astro](https://astro.build/)** | Perfekt für Marketing-Sites: SSR + statische Teile, erstklassige SEO, First-Class Cloudflare Adapter, kann später React/Svelte Islands einbinden. |
| Styling | **Tailwind CSS v4** | Konsistentes Design-System, extrem schneller Build, keine CSS-Fragmentierung. |
| Deployment | **Cloudflare Workers** (`@astrojs/cloudflare`) | Globales Edge-Deployment, kostenloser Einstiegstarif, saubere Integration mit D1/KV/R2. |
| Auth / Admin | Eigener schlanker Layer (PBKDF2 + KV-Sessions) | Edge-kompatibel ohne Node-Abhängigkeiten, später nahtlos durch Lucia/Better-Auth/Auth.js austauschbar. |
| Datenbank (bereit) | **Cloudflare D1** (SQLite) | Für Anfragen, Nutzer, Inhalte. Noch nicht aktiviert, Binding ist in `wrangler.jsonc` vorbereitet. |
| Session-Store | **Cloudflare KV** | Weltweit verteilte Session-Persistenz. Fallback: In-Memory in der Entwicklung. |
| E-Mail (optional) | **Resend** über HTTPS | Edge-fähig, keine SMTP-Dependency. |

Alternative, die ich bewusst **nicht** gewählt habe: Next.js. Für diese Art von Marketing-/
Business-Website ist Next.js überdimensioniert, der Bundle-Overhead größer, und die
Cloudflare-Integration komplexer (OpenNext). Astro liefert bei weniger Bytes bessere
Lighthouse-Scores und ist für den geplanten Umfang (CMS-ähnlich + kleines Admin-Panel)
die beste Wahl.

---

## Lokale Entwicklung

Voraussetzungen: Node.js **20** oder neuer, npm.

```bash
npm install
npm run dev            # Astro Dev-Server (Port 4321)
```

Für den Edge-Build inkl. Cloudflare-Runtime (`locals.runtime.env`, Bindings):

```bash
npm run build
npm run cf:dev         # Wrangler dev, nutzt dist/ und wrangler.jsonc
```

### Typecheck

```bash
npm run check
```

---

## Deployment auf Cloudflare

1. **Wrangler anmelden**

   ```bash
   npx wrangler login
   ```

2. **Secrets setzen** (Produktion)

   ```bash
   # Admin-Passwort erzeugen und als Hash speichern:
   node --input-type=module -e "import('./src/lib/auth.ts').then(async (m) => console.log(await m.hashPassword('DEIN_STARKES_PASSWORT')))"
   # Ausgabe (beginnt mit "pbkdf2$...") hinterlegen:
   npx wrangler secret put ADMIN_PASSWORD_HASH

   # Optional für E-Mail-Benachrichtigung über Resend:
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put CONTACT_TO_EMAIL
   ```

3. **Optional: D1 + KV für Session-Persistenz und spätere Features**

   ```bash
   npx wrangler d1 create zeus-service-db
   npx wrangler kv namespace create SESSIONS
   ```

   Die zurückgegebenen IDs in `wrangler.jsonc` eintragen (Blöcke sind
   dort als Kommentar vorbereitet) und anschließend die generierten
   Bindings-Typen aktualisieren:

   ```bash
   npx wrangler types
   ```

4. **Build & Deploy**

   ```bash
   npm run cf:deploy
   ```

   Der Worker läuft dann unter `https://zeus-service-web.<account>.workers.dev`
   oder einer verbundenen Custom Domain (`zeus-service.de`).

5. **Custom Domain** über das Cloudflare Dashboard → Workers & Pages →
   `zeus-service-web` → "Custom Domains" verbinden.

---

## Projektstruktur

```
src/
  components/        UI-Komponenten (Header, Footer, Hero, Services, …)
  config/site.ts     Zentrale Site-Konfiguration (Navigation, Kontakt, Öffnungszeiten)
  layouts/           Layout- und Admin-Layout
  lib/
    auth.ts          Login/Session (PBKDF2 + KV)
    validation.ts    Formular-Validierung
  pages/
    index.astro      Startseite
    impressum.astro  Impressum
    datenschutz.astro Datenschutz
    login.astro      Admin-Login
    admin/           Geschütztes Admin-Panel
    api/
      contact.ts     POST /api/contact
      auth/
        login.ts     POST /api/auth/login
        logout.ts    POST /api/auth/logout
  styles/global.css  Tailwind v4 + Design-Tokens
public/
  robots.txt, favicon.svg, og-image.svg
astro.config.mjs
wrangler.jsonc
```

---

## Nächste Schritte

Das Fundament ist gelegt. Als Nächstes bieten sich an:

- D1-Schema anlegen (`contact_requests`, `users`) und `/admin/anfragen` an
  die Datenbank anbinden.
- Admin-UI erweitern: Status setzen, Suche, Export, Mehrbenutzer-Login.
- Google Business / Bewertungen einbinden (sobald vorhanden).
- Cookie-Hinweis, falls Analyse-Tools ergänzt werden.
- Rich Content: Projekt-Galerie, Fallbeispiele, Blog für lokale SEO.
