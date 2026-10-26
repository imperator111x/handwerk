/**
 * Disposable-/Throwaway-Mail-Domains (Blacklist).
 * Quelle: https://github.com/disposable/disposable-email-domains (MIT, täglich aktualisiert).
 * Wird zur Laufzeit geladen und 24h gecacht – nicht in den Worker-Bundle gebündelt.
 */

const LIST_URL = "https://disposable.github.io/disposable-email-domains/domains.json";
const CACHE_KEY = "https://zeus-service.internal/spam/disposable-domains.json";
const MEMORY_TTL_MS = 6 * 60 * 60 * 1000; // 6h im Isolate
const EDGE_CACHE_SECONDS = 24 * 60 * 60; // 24h Cache API

let memory: { loadedAt: number; domains: Set<string> } | null = null;

/** Zusätzliche Domains aus Live-Spam, die (noch) nicht in der Community-Liste stehen. */
const EXTRA_BLOCKED = new Set([
  "labliss.me",
  "dortmandin.com",
  "guselux.de",
  "digitalsiber.id",
]);

function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.+$/, "");
}

async function fetchDomainList(): Promise<string[]> {
  const response = await fetch(LIST_URL, {
    headers: { accept: "application/json" },
    // Cloudflare Workers Cache-Hint (wird außerhalb von CF ignoriert)
    ...({ cf: { cacheTtl: EDGE_CACHE_SECONDS, cacheEverything: true } } as object),
  });
  if (!response.ok) {
    throw new Error(`disposable_list_http_${response.status}`);
  }
  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("disposable_list_invalid");
  return data.filter((item): item is string => typeof item === "string");
}

async function loadFromEdgeCache(): Promise<Set<string> | null> {
  try {
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    if (!cache) return null;
    const hit = await cache.match(CACHE_KEY);
    if (!hit) return null;
    const data = (await hit.json()) as unknown;
    if (!Array.isArray(data)) return null;
    return new Set(data.filter((item): item is string => typeof item === "string"));
  } catch {
    return null;
  }
}

async function storeInEdgeCache(domains: string[]): Promise<void> {
  try {
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    if (!cache) return;
    const body = JSON.stringify(domains);
    await cache.put(
      CACHE_KEY,
      new Response(body, {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${EDGE_CACHE_SECONDS}`,
        },
      }),
    );
  } catch {
    /* Cache optional */
  }
}

/** Lädt die Domain-Liste (Memory → Cache API → Upstream). */
export async function getDisposableDomains(): Promise<Set<string>> {
  if (memory && Date.now() - memory.loadedAt < MEMORY_TTL_MS) {
    return memory.domains;
  }

  const cached = await loadFromEdgeCache();
  if (cached && cached.size > 0) {
    memory = { loadedAt: Date.now(), domains: cached };
    return cached;
  }

  try {
    const list = await fetchDomainList();
    const domains = new Set(list.map((d) => d.toLowerCase()));
    memory = { loadedAt: Date.now(), domains };
    void storeInEdgeCache(list);
    return domains;
  } catch (err) {
    console.error("disposable_domains_load_failed", err);
    // Bei Ausfall: letzte Memory-Version oder leeres Set (Heuristik greift weiter).
    if (memory) return memory.domains;
    return new Set();
  }
}

/** True, wenn die E-Mail-Domain als Disposable/Throwaway gilt. */
export async function isDisposableEmail(email: string | null | undefined): Promise<boolean> {
  const domain = emailDomain(email ?? "");
  if (!domain) return false;
  if (EXTRA_BLOCKED.has(domain)) return true;

  // Parent-Domain prüfen (a.b.throwaway.com → throwaway.com)
  const domains = await getDisposableDomains();
  if (domains.size === 0) return false;
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i += 1) {
    const candidate = parts.slice(i).join(".");
    if (domains.has(candidate)) return true;
  }
  return false;
}

/** Nur für Tests: Memory-Cache zurücksetzen. */
export function resetDisposableDomainCache(): void {
  memory = null;
}
