import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { cfEnv } from "../../../lib/cf";
import { getDb, signatureNameForUser } from "../../../lib/db";
import { getQuote, offerPdfForQuote, quoteParty } from "../../../lib/offers";

export const prerender = false;

export async function GET(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const id = Number.parseInt(ctx.url.searchParams.get("id") ?? "", 10);
  if (!db || !Number.isFinite(id) || id <= 0) return new Response("Nicht gefunden", { status: 404 });
  const quote = await getQuote(db, id);
  if (!quote) return new Response("Nicht gefunden", { status: 404 });
  const party = await quoteParty(db, quote);
  if (!party) return new Response("Nicht gefunden", { status: 404 });
  const env = cfEnv();
  const authorName = await signatureNameForUser(db, session.userId, session.username);
  const pdf = offerPdfForQuote(quote, party, authorName || env?.SITE_NAME || "Zeus-Service");
  return new Response(pdf.bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdf.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
