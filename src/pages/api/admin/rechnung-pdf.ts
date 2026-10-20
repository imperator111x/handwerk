import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getDb, signatureNameForUser } from "../../../lib/db";
import { getInvoice, renderInvoicePdf } from "../../../lib/invoices";
import { readStoredOffer } from "../../../lib/quote";

export const prerender = false;

export async function GET(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const id = Number.parseInt(ctx.url.searchParams.get("id") ?? "", 10);
  if (!db || !Number.isFinite(id) || id <= 0) return new Response("Nicht gefunden", { status: 404 });
  const row = await getInvoice(db, id);
  if (!row) return new Response("Nicht gefunden", { status: 404 });
  const stored = readStoredOffer(row.lines_json, "");
  const authorName = await signatureNameForUser(db, session.userId, session.username);
  const pdf = renderInvoicePdf(row, stored, authorName);
  return new Response(pdf.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
