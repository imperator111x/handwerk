import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { cfEnv } from "../../../lib/cf";
import { getContactRequest, getDb, signatureNameForUser } from "../../../lib/db";
import { decodeHtmlEntities } from "../../../lib/html-entities";
import { buildOfferPdf } from "../../../lib/offer-pdf";
import { cleanOffer, saveQuote, sendOfferEmail, updateQuoteDelivery } from "../../../lib/offers";
import { formatBerlinDate, formatOfferDate, offerNumber } from "../../../lib/quote";
import { greetingFromForm } from "../../../lib/salutation";

export const prerender = false;

function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const env = cfEnv();
  const form = await ctx.request.formData();
  const requestId = Number.parseInt(String(form.get("request_id") ?? ""), 10);
  const back = `/admin/anfragen/${Number.isFinite(requestId) ? requestId : ""}`;
  if (!db || !env || !Number.isFinite(requestId) || requestId <= 0) {
    return ctx.redirect(`${back}?angebot=db`, 303);
  }
  const request = await getContactRequest(db, requestId);
  if (!request) return ctx.redirect("/admin/anfragen?angebot=missing", 303);
  const offer = cleanOffer(form);
  if (!offer) return ctx.redirect(`${back}?angebot=bad`, 303);

  const authorName = await signatureNameForUser(db, session.userId, session.username);
  const customerName = decodeHtmlEntities(request.name);
  const greeting = greetingFromForm(form, customerName);
  const createdAt = Math.floor(Date.now() / 1000);

  if (String(form.get("preview") ?? "") === "1") {
    const bytes = buildOfferPdf({
      number: "Entwurf",
      dateLabel: formatBerlinDate(createdAt),
      customerName,
      customerEmail: request.email,
      customerPhone: request.phone,
      title: offer.title,
      greeting,
      intro: offer.intro,
      lines: offer.lines,
      validUntilLabel: formatOfferDate(offer.validUntil),
      authorName,
    });
    return pdfResponse(bytes, "Angebot-Entwurf.pdf");
  }

  const quoteId = await saveQuote(db, request.id, offer, greeting);
  if (!quoteId) return ctx.redirect(`${back}?angebot=db`, 303);
  const number = offerNumber(quoteId, createdAt);
  const filename = `Angebot-${number}.pdf`;
  const pdf = buildOfferPdf({
    number,
    dateLabel: formatBerlinDate(createdAt),
    customerName,
    customerEmail: request.email,
    customerPhone: request.phone,
    title: offer.title,
    greeting,
    intro: offer.intro,
    lines: offer.lines,
    validUntilLabel: formatOfferDate(offer.validUntil),
    authorName,
  });
  const delivery = await sendOfferEmail(env, {
    to: request.email,
    recipientName: customerName,
    authorName,
    greeting,
    offer,
    filename,
    pdf,
    number,
  });
  await updateQuoteDelivery(db, quoteId, delivery);
  const flag = delivery.emailStatus.startsWith("sent:")
    ? "sent"
    : delivery.emailStatus.startsWith("skipped")
      ? "saved"
      : "failed";
  return ctx.redirect(`${back}?angebot=${flag}`, 303);
}
