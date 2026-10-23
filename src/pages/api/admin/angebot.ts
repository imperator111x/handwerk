import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { cfEnv } from "../../../lib/cf";
import { ensureCustomer, getCustomer } from "../../../lib/customers";
import { getContactRequest, getDb, signatureNameForUser } from "../../../lib/db";
import { decodeHtmlEntities } from "../../../lib/html-entities";
import { buildOfferPdf } from "../../../lib/offer-pdf";
import { cleanOffer, saveQuote, sendOfferEmail, updateQuoteDelivery } from "../../../lib/offers";
import { formatBerlinDate, formatOfferDate, hourlyOfferMissingWage, offerNumber } from "../../../lib/quote";
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
  const customerId = Number.parseInt(String(form.get("customer_id") ?? ""), 10);
  const hasRequest = Number.isFinite(requestId) && requestId > 0;
  const hasCustomer = Number.isFinite(customerId) && customerId > 0;
  const back = hasCustomer ? `/admin/kunden/${customerId}` : `/admin/anfragen/${hasRequest ? requestId : ""}`;
  if (!db || !env || (!hasRequest && !hasCustomer)) {
    return ctx.redirect(`${back}?angebot=db`, 303);
  }

  const request = hasRequest ? await getContactRequest(db, requestId) : null;
  if (hasRequest && !request) return ctx.redirect("/admin/anfragen?angebot=missing", 303);
  const storedCustomer = hasCustomer ? await getCustomer(db, customerId) : null;
  if (hasCustomer && !storedCustomer) return ctx.redirect("/admin/kunden?kunde=missing", 303);

  const party = storedCustomer
    ? {
        name: decodeHtmlEntities(storedCustomer.name),
        email: storedCustomer.email,
        phone: storedCustomer.phone,
        street: storedCustomer.street,
        postalCode: storedCustomer.postal_code,
        city: storedCustomer.city,
      }
    : request
      ? {
          name: decodeHtmlEntities(request.name),
          email: request.email,
          phone: request.phone,
          street: null,
          postalCode: null,
          city: null,
        }
      : null;
  if (!party) return ctx.redirect(`${back}?angebot=db`, 303);

  if (hourlyOfferMissingWage(form)) return ctx.redirect(`${back}?angebot=hours`, 303);
  const offer = cleanOffer(form);
  if (!offer) return ctx.redirect(`${back}?angebot=bad`, 303);

  const authorName = await signatureNameForUser(db, session.userId, session.username);
  const greeting = greetingFromForm(form, party.name);
  const createdAt = Math.floor(Date.now() / 1000);
  const pdfCustomer = {
    customerName: party.name,
    customerEmail: party.email,
    customerPhone: party.phone,
    customerStreet: party.street,
    customerPostalCode: party.postalCode,
    customerCity: party.city,
  };

  if (String(form.get("preview") ?? "") === "1") {
    const bytes = buildOfferPdf({
      number: "Entwurf",
      dateLabel: formatBerlinDate(createdAt),
      ...pdfCustomer,
      title: offer.title,
      greeting,
      intro: offer.intro,
      lines: offer.lines,
      validUntilLabel: formatOfferDate(offer.validUntil),
      authorName,
      billing: offer.billing,
      discount: offer.discount ?? null,
    });
    return pdfResponse(bytes, "Angebot-Entwurf.pdf");
  }

  const linkedCustomerId = storedCustomer
    ? storedCustomer.id
    : request
      ? await ensureCustomer(db, { name: party.name, email: party.email, phone: party.phone })
      : null;
  const quoteId = await saveQuote(
    db,
    { requestId: request?.id ?? null, customerId: linkedCustomerId },
    offer,
    greeting,
  );
  if (!quoteId) return ctx.redirect(`${back}?angebot=db`, 303);
  const number = offerNumber(quoteId, createdAt);
  const filename = `Angebot-${number}.pdf`;
  const pdf = buildOfferPdf({
    number,
    dateLabel: formatBerlinDate(createdAt),
    ...pdfCustomer,
    title: offer.title,
    greeting,
    intro: offer.intro,
    lines: offer.lines,
    validUntilLabel: formatOfferDate(offer.validUntil),
    authorName,
    billing: offer.billing,
    discount: offer.discount ?? null,
  });
  const delivery = await sendOfferEmail(env, {
    to: party.email,
    recipientName: party.name,
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
