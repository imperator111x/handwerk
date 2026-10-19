#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Zeus-Service · Cloudflare-Erst-Setup
#
# Legt D1-Datenbank + KV-Namespace an, traegt die Bindings in wrangler.jsonc
# ein, fuehrt die Migrations aus, legt den Admin-User (DB + Secret) an und
# deployt den Worker.
#
# Voraussetzungen:
#   - Node.js >=20, npm, bash, awk, sed, python3 (standard auf Ubuntu/macOS)
#   - CLOUDFLARE_API_TOKEN (empfohlen) als Umgebungsvariable
#     Scopes: Account > D1 Edit, Workers KV Storage Edit, Workers Scripts Edit
#     plus Zone > Workers Routes Edit falls Custom Domains gewuenscht
#   - optional CLOUDFLARE_ACCOUNT_ID (wird sonst via `wrangler whoami` ermittelt)
#
# Nutzung:
#   bash scripts/setup-cloudflare.sh
#   bash scripts/setup-cloudflare.sh --skip-deploy  # nur provisionieren
# -----------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

DB_NAME="zeus-service-db"
KV_BINDING="SESSIONS"
WRANGLER="npx --yes wrangler@latest"
SKIP_DEPLOY=0

for arg in "$@"; do
  case "$arg" in
    --skip-deploy) SKIP_DEPLOY=1 ;;
    -h|--help)
      sed -n '1,30p' "$0"
      exit 0
      ;;
  esac
done

log() { printf "\033[1;34m▶\033[0m %s\n" "$*"; }
ok()  { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
warn(){ printf "\033[1;33m!\033[0m %s\n" "$*"; }
die() { printf "\033[1;31m✗\033[0m %s\n" "$*" >&2; exit 1; }

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  warn "CLOUDFLARE_API_TOKEN ist nicht gesetzt."
  warn "Lege einen Token im Cloudflare-Dashboard an (My Profile → API Tokens)"
  warn "mit Rechten: D1 Edit, Workers KV Storage Edit, Workers Scripts Edit."
  warn "Dann:  export CLOUDFLARE_API_TOKEN='…'  und Skript erneut ausfuehren."
  die  "Abbruch."
fi

log "Pruefe wrangler-Zugang"
$WRANGLER whoami >/dev/null 2>&1 || die "Wrangler-Login via Token fehlgeschlagen – Token-Rechte pruefen."
ok "Wrangler ist authentifiziert."

# Kleines Hilfs-Setup: JSON-Validator
is_json() { python3 -c "import json,sys;json.load(sys.stdin)" >/dev/null 2>&1 <<<"$1"; }

check_scope() {
  # $1 = cmd label (fuer Fehler), $2 = scope-hinweis
  local label="$1" scope="$2"
  warn "Rohe Ausgabe:"
  printf '%s\n' "$3" | sed 's/\x1b\[[0-9;]*m//g' | head -30 >&2
  die "'$label' fehlgeschlagen. Der Cloudflare-API-Token hat vermutlich keinen »$scope«-Scope. 
     Fix: Cloudflare-Dashboard → My Profile → API Tokens → Token bearbeiten → Permission »$scope« ergaenzen und erneut ausfuehren."
}

# ---------------------------------------------------------------------------
# D1-Datenbank anlegen (idempotent)
# ---------------------------------------------------------------------------
log "Suche D1-Datenbank »$DB_NAME«"
DB_LIST_JSON="$($WRANGLER d1 list --json 2>&1 || true)"
if ! is_json "$DB_LIST_JSON"; then
  check_scope "wrangler d1 list" "Account · D1 · Edit" "$DB_LIST_JSON"
fi
DB_ID="$(python3 - "$DB_LIST_JSON" "$DB_NAME" <<'PY'
import json, sys
data = json.loads(sys.argv[1])
name = sys.argv[2]
for d in data:
    if d.get("name") == name:
        print(d.get("uuid") or d.get("id") or "")
        break
PY
)"

if [[ -z "$DB_ID" ]]; then
  log "Lege D1-Datenbank »$DB_NAME« an"
  CREATE_OUT="$($WRANGLER d1 create "$DB_NAME" 2>&1)" || { echo "$CREATE_OUT"; die "D1 konnte nicht angelegt werden."; }
  echo "$CREATE_OUT"
  DB_ID="$(printf '%s\n' "$CREATE_OUT" | awk -F'"' '/database_id/ {print $4; exit}')"
  [[ -n "$DB_ID" ]] || die "D1 konnte nicht angelegt werden – Ausgabe oben pruefen."
fi
ok "D1 ID: $DB_ID"

# ---------------------------------------------------------------------------
# KV-Namespace anlegen (idempotent)
# ---------------------------------------------------------------------------
log "Suche KV-Namespace »$KV_BINDING«"
KV_LIST_JSON="$($WRANGLER kv namespace list 2>&1 || true)"
if ! is_json "$KV_LIST_JSON"; then
  check_scope "wrangler kv namespace list" "Account · Workers KV Storage · Edit" "$KV_LIST_JSON"
fi
KV_ID="$(python3 - "$KV_LIST_JSON" "$KV_BINDING" <<'PY'
import json, sys
data = json.loads(sys.argv[1])
title = sys.argv[2]
for n in data:
    if n.get("title", "").endswith(title) or n.get("title") == title:
        print(n.get("id") or "")
        break
PY
)"

if [[ -z "$KV_ID" ]]; then
  log "Lege KV-Namespace »$KV_BINDING« an"
  KV_OUT="$($WRANGLER kv namespace create "$KV_BINDING" 2>&1)" || { echo "$KV_OUT"; die "KV konnte nicht angelegt werden."; }
  echo "$KV_OUT"
  KV_ID="$(printf '%s\n' "$KV_OUT" | awk -F'"' '/\"id\"/ {print $4; exit}')"
  [[ -n "$KV_ID" ]] || die "KV konnte nicht angelegt werden – Ausgabe oben pruefen."
fi
ok "KV ID: $KV_ID"

# ---------------------------------------------------------------------------
# wrangler.jsonc aktualisieren
# ---------------------------------------------------------------------------
log "Aktualisiere wrangler.jsonc mit Bindings"
python3 - "$ROOT/wrangler.jsonc" "$DB_ID" "$KV_ID" "$DB_NAME" "$KV_BINDING" <<'PY'
import json, re, sys, pathlib

path, db_id, kv_id, db_name, kv_binding = sys.argv[1:]
raw = pathlib.Path(path).read_text()

# JSONC-Kommentare temporaer entfernen zum Parsen
clean = re.sub(r'//.*', '', raw)
clean = re.sub(r'/\*.*?\*/', '', clean, flags=re.S)
cfg = json.loads(clean)

cfg["d1_databases"] = [
    {
        "binding": "DB",
        "database_name": db_name,
        "database_id": db_id,
    }
]
cfg["kv_namespaces"] = [
    {
        "binding": kv_binding,
        "id": kv_id,
    }
]

# Kommentare behalten – wir schreiben einen sauberen JSON-Header + Original-Kommentar-Footer
header = """/**
 * Wrangler-Konfiguration · von scripts/setup-cloudflare.sh gepflegte Datei.
 * Manuelle Aenderungen bleiben erhalten, solange `d1_databases` und
 * `kv_namespaces` am Ende des Objekts stehen.
 */
"""
pathlib.Path(path).write_text(header + json.dumps(cfg, indent=2) + "\n")
print("wrangler.jsonc aktualisiert.")
PY
ok "wrangler.jsonc enthaelt jetzt D1- und KV-Bindings."

# ---------------------------------------------------------------------------
# Migrationen
# ---------------------------------------------------------------------------
log "Fuehre SQL-Migrations gegen D1 aus"
for migration in migrations/*.sql; do
  log "  → $migration"
  $WRANGLER d1 execute "$DB_NAME" --remote --file="$migration"
done
ok "Migrations erfolgreich ausgefuehrt."

# ---------------------------------------------------------------------------
# Admin-Benutzer in DB anlegen
# ---------------------------------------------------------------------------
if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
  if [[ -t 0 ]]; then
    log "Admin-Passwort setzen (nur Eingabe sichtbar machen, nicht loggen)"
    read -r -s -p "Neues Admin-Passwort: " ADMIN_PASSWORD; echo
    read -r -s -p "Passwort wiederholen: " ADMIN_PASSWORD_CONFIRM; echo
    [[ "$ADMIN_PASSWORD" == "$ADMIN_PASSWORD_CONFIRM" ]] \
      || die "Passwoerter stimmen nicht ueberein."
  else
    die "ADMIN_PASSWORD ist nicht gesetzt und keine interaktive Eingabe moeglich."
  fi
fi

ADMIN_USERNAME_VAL="${ADMIN_USERNAME:-admin}"
log "Erzeuge PBKDF2-Hash fuer User »$ADMIN_USERNAME_VAL«"
PASSWORD_HASH="$(node --input-type=module -e "
function toHex(buf){return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function h(p,i=210000){const s=new ArrayBuffer(16);crypto.getRandomValues(new Uint8Array(s));
const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(p),{name:'PBKDF2'},false,['deriveBits']);
const b=await crypto.subtle.deriveBits({name:'PBKDF2',salt:s,iterations:i,hash:'SHA-256'},k,256);
return 'pbkdf2\$'+i+'\$'+toHex(s)+'\$'+toHex(b);} console.log(await h(process.env.P));" P="$ADMIN_PASSWORD")"

log "Lege Admin-User in D1 an (idempotent, überschreibt Passwort-Hash)"
$WRANGLER d1 execute "$DB_NAME" --remote --command "
INSERT INTO users (username, password_hash, role)
VALUES ('$ADMIN_USERNAME_VAL', '$PASSWORD_HASH', 'admin')
ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash;
"
ok "Admin-User in D1 angelegt."

log "Setze ADMIN_PASSWORD_HASH zusätzlich als Secret (Fallback-Login)"
printf '%s' "$PASSWORD_HASH" | $WRANGLER secret put ADMIN_PASSWORD_HASH
ok "Secret gesetzt."

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------
if [[ "$SKIP_DEPLOY" -eq 1 ]]; then
  warn "Deploy übersprungen (--skip-deploy). Jetzt noch: npm run build && npx wrangler deploy"
  exit 0
fi

log "Baue und deploye den Worker"
npm run build
$WRANGLER deploy
ok "Deploy abgeschlossen. Dein Worker läuft."
log "Nächster Schritt: Custom Domain »zeus-service.de« im Cloudflare-Dashboard verbinden."
