import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { getTimesheet, timesheetPdf } from "../../../lib/timesheets";

export const prerender = false;

export async function GET(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const db = getDb(ctx);
  const id = Number.parseInt(ctx.url.searchParams.get("id") ?? "", 10);
  const row = db && Number.isFinite(id) ? await getTimesheet(db, id) : null;
  if (!row) return ctx.redirect("/admin/stundenzettel?zettel=missing", 303);
  const pdf = await timesheetPdf(row);
  return new Response(pdf.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
