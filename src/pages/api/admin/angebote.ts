import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { cfEnv } from "../../../lib/cf";
import { getDb, signatureNameForUser } from "../../../lib/db";
import { JOB_STATUSES, type JobStatus } from "../../../lib/jobs";
import {
  berlinTodayIso,
  cleanOffer,
  deleteQuote,
  getQuote,
  invoiceIdForQuote,
  offerPdfForQuote,
  quoteParty,
  quoteStatus,
  sendOfferEmail,
  updateQuote,
  updateQuoteDelivery,
  updateQuoteJobStatus,
  updateQuoteStatus,
} from "../../../lib/offers";
import { hourlyOfferMissingWage, offerNumber } from "../../../lib/quote";
import { greetingFromForm } from "../../../lib/salutation";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const env = cfEnv();
  const form = await ctx.request.formData();
  const id = Number.parseInt(String(form.get("id") ?? ""), 10);
  const action = String(form.get("action") ?? "");
  if (!db || !Number.isFinite(id) || id <= 0) {
    return ctx.redirect("/admin/angebote?angebot=db", 303);
  }
  const quote = await getQuote(db, id);
  if (!quote) return ctx.redirect("/admin/angebote?angebot=missing", 303);

  if (action === "delete") {
    await deleteQuote(db, id);
    return ctx.redirect("/admin/angebote?angebot=deleted", 303);
  }

  if (action === "accept") {
    if (quoteStatus(quote.status) === "abgerechnet") {
      return ctx.redirect(`/admin/angebote/${id}?angebot=locked`, 303);
    }
    await updateQuoteStatus(db, id, "angenommen");
    return ctx.redirect(`/admin/angebote/${id}?angebot=accepted`, 303);
  }

  if (action === "reopen") {
    if (quoteStatus(quote.status) === "abgerechnet") {
      const invoiceId = await invoiceIdForQuote(db, id);
      if (invoiceId) return ctx.redirect(`/admin/angebote/${id}?angebot=locked`, 303);
    }
    await updateQuoteStatus(db, id, "offen");
    return ctx.redirect(`/admin/angebote/${id}?angebot=reopened`, 303);
  }

  if (action === "job") {
    const job = String(form.get("job_status") ?? "") as JobStatus;
    if (!JOB_STATUSES.includes(job) || job === "abgerechnet") {
      return ctx.redirect(`/admin/angebote/${id}?angebot=bad`, 303);
    }
    if (quoteStatus(quote.status) === "offen") {
      await updateQuoteStatus(db, id, "angenommen");
    }
    if (quoteStatus(quote.status) === "abgerechnet") {
      return ctx.redirect(`/admin/angebote/${id}?angebot=locked`, 303);
    }
    await updateQuoteJobStatus(db, id, job);
    const back = String(form.get("redirect") ?? "").trim();
    if (back.startsWith("/admin/")) return ctx.redirect(back, 303);
    return ctx.redirect(`/admin/auftraege?auftrag=saved`, 303);
  }

  if (action !== "save" && action !== "resend") {
    return ctx.redirect(`/admin/angebote/${id}?angebot=bad`, 303);
  }
  if (hourlyOfferMissingWage(form)) return ctx.redirect(`/admin/angebote/${id}?angebot=hours`, 303);
  const offer = cleanOffer(form, berlinTodayIso(), { allowPast: true });
  if (!offer) return ctx.redirect(`/admin/angebote/${id}?angebot=bad`, 303);

  const party = await quoteParty(db, quote);
  if (!party) return ctx.redirect("/admin/angebote?angebot=missing", 303);
  const greeting = greetingFromForm(form, party.name);
  await updateQuote(db, id, offer, greeting);

  if (action === "resend") {
    if (!env) return ctx.redirect(`/admin/angebote/${id}?angebot=saved`, 303);
    const authorName = await signatureNameForUser(db, session.userId, session.username);
    const updated = await getQuote(db, id);
    if (!updated) return ctx.redirect("/admin/angebote?angebot=missing", 303);
    const pdf = offerPdfForQuote(updated, party, authorName);
    const delivery = await sendOfferEmail(env, {
      to: party.email,
      recipientName: party.name,
      authorName,
      greeting,
      offer,
      filename: pdf.filename,
      pdf: pdf.bytes,
      number: offerNumber(updated.id, updated.created_at),
    });
    await updateQuoteDelivery(db, id, delivery);
    const flag = delivery.emailStatus.startsWith("sent:")
      ? "sent"
      : delivery.emailStatus.startsWith("skipped")
        ? "saved"
        : "failed";
    return ctx.redirect(`/admin/angebote?angebot=${flag}`, 303);
  }

  return ctx.redirect("/admin/angebote?angebot=saved", 303);
}
