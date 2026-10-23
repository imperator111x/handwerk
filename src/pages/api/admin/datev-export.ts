import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { buildDatevCsv, monthBounds } from "../../../lib/datev-export";
import { berlinTodayIso } from "../../../lib/offers";
import { listInvoicesInPeriod } from "../../../lib/invoices";

export const prerender = false;

export async function GET(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const db = getDb(ctx);
  if (!db) return new Response("Datenbank fehlt", { status: 503 });

  const monthParam = ctx.url.searchParams.get("monat")?.trim() || berlinTodayIso().slice(0, 7);
  const bounds = monthBounds(monthParam);
  if (!bounds) return new Response("Monat ungültig (YYYY-MM)", { status: 400 });

  const rows = await listInvoicesInPeriod(db, bounds.from, bounds.to);
  const csv = buildDatevCsv(rows, bounds.from, bounds.to);
  const filename = `Buchhaltung-${monthParam}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
