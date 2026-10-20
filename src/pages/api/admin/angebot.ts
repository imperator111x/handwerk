import { cfEnv } from "../../../lib/cf";
import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getContactRequest, getDb, signatureNameForUser } from "../../../lib/db";
import { greetingFromForm } from "../../../lib/salutation";

export const prerender = false;

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
  const delivery = await sendOfferEmail(env, {
    to: request.email,
    recipientName: request.name,
    authorName,
    greeting: greetingFromForm(form, request.name),
    offer,
  });
  await saveQuote(db, request.id, offer, delivery);
  const flag = delivery.emailStatus.startsWith("sent:")
    ? "sent"
    : delivery.emailStatus.startsWith("skipped")
      ? "saved"
      : "failed";
  return ctx.redirect(`${back}?angebot=${flag}`, 303);
}
