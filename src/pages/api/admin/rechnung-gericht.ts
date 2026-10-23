import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getDb, signatureNameForUser } from "../../../lib/db";
import {
  buildMahnverfahrenText,
  mahnverfahrenZipName,
  reminderNoticeKind,
} from "../../../lib/mahnverfahren-export";
import { getInvoice, relatedInvoice, renderInvoicePdf } from "../../../lib/invoices";
import { berlinTodayIso } from "../../../lib/offers";
import { readStoredOffer } from "../../../lib/quote";
import { buildStoreZip } from "../../../lib/zip-store";

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
  if (row.document_kind === "storno") {
    return new Response("Für Stornorechnungen gibt es keinen Gerichts-Export.", { status: 400 });
  }

  const stored = readStoredOffer(row.lines_json, "");
  const authorName = await signatureNameForUser(db, session.userId, session.username);
  const related = await relatedInvoice(db, row);
  const invoicePdf = renderInvoicePdf(row, stored, authorName, related);
  const dossier = buildMahnverfahrenText({ row, stored, today: berlinTodayIso() });
  const entries = [
    { name: dossier.filename, bytes: new TextEncoder().encode(dossier.text) },
    { name: invoicePdf.filename, bytes: invoicePdf.bytes },
  ];

  const noticeKind = reminderNoticeKind(row.reminder_level);
  if (noticeKind) {
    const noticePdf = renderInvoicePdf(row, stored, authorName, related, noticeKind);
    entries.push({ name: noticePdf.filename, bytes: noticePdf.bytes });
  }

  const zip = buildStoreZip(entries);
  const filename = mahnverfahrenZipName(row);
  return new Response(zip, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
