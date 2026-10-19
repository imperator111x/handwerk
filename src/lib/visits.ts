import { berlinLocalToUnix } from "./appointments";

const OWN_HOSTS = new Set([
  "zeus-service.de",
  "www.zeus-service.de",
  "zeus-service-web.imperator111x.workers.dev",
]);

export function visitSource(referrer: string, utm: string): string {
  const campaign = utm.trim().slice(0, 40);
  if (/^[a-z0-9][a-z0-9._-]{0,39}$/i.test(campaign)) return campaign;
  const raw = referrer.trim();
  if (!raw) return "Direkt";
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (OWN_HOSTS.has(host) || host.endsWith(".zeus-service.de")) return "Eigene Website";
    if (host === "google.com" || host.endsWith(".google.com") || host.endsWith(".google.de")) {
      return "Google";
    }
    if (host === "bing.com" || host.endsWith(".bing.com")) return "Bing";
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
    if (
      host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "fb.com" ||
      host.endsWith(".fb.com") ||
      host === "l.facebook.com"
    ) {
      return "Facebook";
    }
    if (host === "t.co" || host.endsWith(".twitter.com") || host === "x.com" || host.endsWith(".x.com")) {
      return "X";
    }
    return host.replace(/^www\./, "").slice(0, 80);
  } catch {
    return "Direkt";
  }
}

export function safeVisitPath(value: string): string | null {
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 160) return null;
  if (path.startsWith("/admin") || path.startsWith("/api") || path.startsWith("/login")) return null;
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(path)) return null;
  return path;
}

export async function recordVisit(
  db: D1Database,
  input: { path: string; source: string; country: string | null },
): Promise<void> {
  await db
    .prepare(`INSERT INTO page_views (created_at, path, source, country) VALUES (?, ?, ?, ?)`)
    .bind(Math.floor(Date.now() / 1000), input.path, input.source, input.country)
    .run();
}

export interface VisitStats {
  today: number;
  week: number;
  month: number;
  pages: Array<{ path: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
}

function berlinDayStart(): number {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return berlinLocalToUnix(today, "00:00") ?? Math.floor(Date.now() / 1000) - 24 * 3600;
}

export async function visitOverview(db: D1Database): Promise<VisitStats> {
  const now = Math.floor(Date.now() / 1000);
  const today = berlinDayStart();
  const week = now - 7 * 24 * 3600;
  const month = now - 30 * 24 * 3600;
  const [todayRow, weekRow, monthRow, pages, sources] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM page_views WHERE created_at >= ?`).bind(today).first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM page_views WHERE created_at >= ?`).bind(week).first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM page_views WHERE created_at >= ?`).bind(month).first<{ count: number }>(),
    db
      .prepare(
        `SELECT path, COUNT(*) AS count FROM page_views WHERE created_at >= ? GROUP BY path ORDER BY count DESC LIMIT 8`,
      )
      .bind(month)
      .all<{ path: string; count: number }>(),
    db
      .prepare(
        `SELECT source, COUNT(*) AS count
         FROM page_views
         WHERE created_at >= ? AND source != 'Eigene Website'
         GROUP BY source
         ORDER BY count DESC
         LIMIT 8`,
      )
      .bind(month)
      .all<{ source: string; count: number }>(),
  ]);
  return {
    today: Number(todayRow?.count ?? 0),
    week: Number(weekRow?.count ?? 0),
    month: Number(monthRow?.count ?? 0),
    pages: pages.results ?? [],
    sources: sources.results ?? [],
  };
}
