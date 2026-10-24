# Zeus-Service Website

Neu aufgebaute, verbesserte Version der Website [zeus-service.de](https://zeus-service.de/) –
gehostet auf **Cloudflare Workers**, geschrieben mit **Astro + TypeScript + Tailwind CSS v4**.

Enthalten:

- Modernes Marketing-Frontend (Hero, Leistungen, Über uns, Ablauf, Referenzen, Kontakt)
- Dark-Mode mit Light/System/Dark-Toggle (persistiert via `localStorage`)
- Eigenes Logo (Zeus-Löwenkopf + Wortmarke), Favicons und Open-Graph-Bild
- Kontaktformular mit serverseitiger Validierung, Honeypot-Schutz, Persistenz in **Cloudflare D1** und optionalem E-Mail-Versand via [Resend](https://resend.com/)
- **Admin-Bereich unter `/admin`** mit Login (`/login`), Session-Handling über **Cloudflare KV** und Status-Workflow für Anfragen
- SEO (strukturierte LocalBusiness-Daten, Open Graph, Sitemap), `robots.txt`, 404-Seite
- Impressums- und Datenschutz-Stubs

---

## Warum dieser Stack?

| Baustein | Wahl | Warum |
|---|---|---|
| Sprache | **TypeScript** | Standard im Cloudflare- und Astro-Ökosystem, strikte Typsicherheit, direkt in Workers kompatibel. |
| Framework | **[Astro](https://astro.build/)** | Perfekt für Marketing-Sites: SSR + statische Teile, erstklassige SEO, First-Class Cloudflare Adapter, kann später React/Svelte Islands einbinden. |
| Styling | **Tailwind CSS v4** | Konsistentes Design-System, extrem schneller Build, klassenbasierter Dark-Mode. |
| Deployment | **Cloudflare Workers** (`@astrojs/cloudflare`) | Globales Edge-Deployment, kostenloser Einstiegstarif, saubere Integration mit D1/KV/R2. |
| Auth | Eigener schlanker Layer (PBKDF2 + KV-Sessions) | Edge-kompatibel ohne Node-Abhängigkeiten, später nahtlos durch Lucia/Better-Auth/Auth.js austauschbar. |
| Datenbank | **Cloudflare D1** (SQLite) | Users + Kontaktanfragen. Schema in `migrations/`. |
| Session-Store | **Cloudflare KV** (Binding `SESSIONS`) | Weltweit verteilte Session-Persistenz. Fallback: In-Memory in der Entwicklung. |
| E-Mail (optional) | **Resend** über HTTPS | Edge-fähig, keine SMTP-Dependency. |

Bewusst **nicht** gewählt: Next.js. Für diese Art von Marketing-/Business-Website
ist Next.js überdimensioniert, der Bundle-Overhead größer, und die
Cloudflare-Integration komplexer (OpenNext). Astro liefert bei weniger Bytes
bessere Lighthouse-Scores und ist für den geplanten Umfang (CMS-ähnlich +
kleines Admin-Panel) die beste Wahl.

---

## Lokale Entwicklung

Voraussetzungen: Node.js **20** oder neuer, npm.

```bash
npm install
npm run dev            # Astro Dev-Server (Port 4321)
```

Lokal ohne Cloudflare-Bindings laufen Login (nur mit `ADMIN_PASSWORD_HASH` in
`.dev.vars`) und Kontaktformular bereits – Anfragen werden nur ins Konsolen-Log
geschrieben, bis D1 verfügbar ist.

Für den Edge-Build inklusive Cloudflare-Runtime (`locals.runtime.env`, D1, KV):

```bash
npm run build
npm run cf:dev         # Wrangler dev, nutzt dist/ und wrangler.jsonc
```

### Typecheck

```bash
npm run check
```

---

## Daten & Speicherung

- **Users** werden in der D1-Tabelle `users` abgelegt (siehe
  [`migrations/0001_init.sql`](migrations/0001_init.sql)). Passwörter werden
  **nie** im Klartext gespeichert, sondern als `pbkdf2$<iterations>$<salt_hex>$<hash_hex>`
  (PBKDF2-SHA-256, 100 000 Iterationen, 16-Byte-Zufallssalt, Web Crypto; das ist das von
  Cloudflare Workers Web-Crypto maximal unterstützte Iterationslimit).
- **Kontaktanfragen** landen in `contact_requests` mit Status
  `new | in_progress | done | archived`.
- **Sessions** werden als Zufalls-Token (32 Byte, hex) im HttpOnly-Cookie
  `zs_session` gesetzt und in Cloudflare KV unter `session:<token>` abgelegt
  (TTL 8 Stunden). Secure + SameSite=Lax.
- **Fallback ohne D1:** Es gibt einen zusätzlichen Login über die Env-Variable
  `ADMIN_USERNAME` + Secret `ADMIN_PASSWORD_HASH` – damit kommt man selbst dann
  rein, wenn D1 ausfällt oder leer ist.

---

## Deployment auf Cloudflare

### Option A · Ein-Befehl-Setup (empfohlen)

Das Skript [`scripts/setup-cloudflare.sh`](scripts/setup-cloudflare.sh)
übernimmt alles:

1. Legt D1-Datenbank `zeus-service-db` an (falls nicht vorhanden)
2. Legt KV-Namespace `SESSIONS` an (falls nicht vorhanden)
3. Trägt beide Bindings in `wrangler.jsonc` ein
4. Führt alle `migrations/*.sql` gegen das Remote-D1 aus
5. Erzeugt per PBKDF2 einen Admin-Passwort-Hash und legt den User
   `admin` in D1 an (idempotent); setzt denselben Hash zusätzlich als
   Secret `ADMIN_PASSWORD_HASH` (Fallback)
6. Baut und deployt den Worker

Voraussetzung:

```bash
export CLOUDFLARE_API_TOKEN='…'   # Scopes: D1 Edit, Workers KV Storage Edit, Workers Scripts Edit
# Optional, falls mehrere Accounts:
export CLOUDFLARE_ACCOUNT_ID='…'
```

Dann:

```bash
bash scripts/setup-cloudflare.sh
# oder nur provisionieren ohne Deploy:
bash scripts/setup-cloudflare.sh --skip-deploy
```

> **Token erzeugen:** Cloudflare-Dashboard → *My Profile* → *API Tokens* →
> *Create Token* → Vorlage „Edit Cloudflare Workers" (deckt D1, KV und
> Workers ab) oder Custom-Token mit obigen Scopes.
>
> **Als Cursor-Cloud-Agent:** Den Token in der [Cursor-Dashboard-Oberfläche](https://cursor.com)
> unter *Cloud Agents → Secrets* als `CLOUDFLARE_API_TOKEN` hinterlegen –
> dann steht er in der Agent-VM automatisch als Environment-Variable zur
> Verfügung.

### Option B · manuell

```bash
npx wrangler login
npx wrangler d1 create zeus-service-db
npx wrangler kv namespace create SESSIONS
# IDs in wrangler.jsonc eintragen (die kommentierten Blöcke sind vorbereitet)

for f in migrations/*.sql; do
  npx wrangler d1 execute zeus-service-db --remote --file="$f"
done

# Admin-User:
HASH="$(node --input-type=module -e "
function toHex(b){return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
const s=new ArrayBuffer(16); crypto.getRandomValues(new Uint8Array(s));
const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(process.env.P),{name:'PBKDF2'},false,['deriveBits']);
const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:100000,hash:'SHA-256'},k,256);
console.log('pbkdf2\$100000\$'+toHex(s)+'\$'+toHex(bits));
" P="DEIN_STARKES_PASSWORT")"

npx wrangler d1 execute zeus-service-db --remote --command \
  "INSERT INTO users (username, password_hash, role) VALUES ('admin','$HASH','admin') \
   ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash;"

# Fallback-Secret:
printf '%s' "$HASH" | npx wrangler secret put ADMIN_PASSWORD_HASH

# Optional für E-Mail-Benachrichtigung über Resend:
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put CONTACT_TO_EMAIL

npm run cf:deploy
```

### Custom Domain

Cloudflare Dashboard → **Workers & Pages** → `zeus-service-web` →
*Custom Domains* → `zeus-service.de` verbinden.

---

## Projektstruktur

```
migrations/
  0001_init.sql       D1-Schema (users, contact_requests)
scripts/
  setup-cloudflare.sh Ein-Befehl-Provisionierung (D1 + KV + Migrations + User + Deploy)
src/
  components/         UI-Komponenten (Header, Footer, Hero, Services, Logo, ThemeToggle, …)
  config/site.ts      Zentrale Site-Konfiguration (Navigation, Kontakt, Öffnungszeiten)
  layouts/            Public-Layout + Admin-Layout
  lib/
    auth.ts           Login/Session (PBKDF2 + KV, D1-first mit Env-Fallback)
    db.ts             D1-Helfer (Users, Contact-Requests, Status)
    validation.ts     Formular-Validierung
  pages/
    index.astro       Startseite
    impressum.astro   Impressum
    datenschutz.astro Datenschutz
    login.astro       Admin-Login
    admin/            Geschütztes Admin-Panel (Dashboard, Anfragen, Leistungen, Einstellungen)
    api/
      contact.ts        POST /api/contact
      auth/login.ts     POST /api/auth/login
      auth/logout.ts    POST /api/auth/logout
      admin/anfragen.ts POST /api/admin/anfragen (Status / Löschen)
  styles/global.css   Tailwind v4 + Design-Tokens + Dark-Mode
public/
  robots.txt, logo-*.png, favicon*, og-image.png, site.webmanifest
astro.config.mjs
wrangler.jsonc
```

---

## Nächste Schritte

Das Fundament ist gelegt. Als Nächstes bieten sich an:

- Admin-Mehrbenutzer (Rollen `admin` / `editor`), eigener User-Verwaltungs-UI
- Volltext-Suche + CSV-Export der Anfragen
- Projekt-Galerie / Fallbeispiele / Blog für lokale SEO
- Google-Business-Bewertungen einbinden (sobald vorhanden)
- Cookie-Hinweis, falls Analyse-Tools ergänzt werden
