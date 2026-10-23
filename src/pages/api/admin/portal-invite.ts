import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { cfEnv } from "../../../lib/cf";
import { getCustomer } from "../../../lib/customers";
import { getDb, signatureNameForUser } from "../../../lib/db";
import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "../../../lib/email";
import { createPortalInvite, getPortalAccountByCustomer } from "../../../lib/portal";
import { greetingFromForm } from "../../../lib/salutation";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const env = cfEnv();
  const form = await ctx.request.formData();
  const customerId = Number.parseInt(String(form.get("customer_id") ?? ""), 10);
  const back = Number.isFinite(customerId) ? `/admin/kunden/${customerId}` : "/admin/kunden";
  if (!db || !env || !Number.isFinite(customerId) || customerId <= 0) {
    return ctx.redirect(`${back}?portal=bad`, 303);
  }
  const customer = await getCustomer(db, customerId);
  if (!customer) return ctx.redirect("/admin/kunden?kunde=missing", 303);

  const existing = await getPortalAccountByCustomer(db, customer.id);
  if (existing) return ctx.redirect(`${back}?portal=exists`, 303);

  const invite = await createPortalInvite(db, {
    customerId: customer.id,
    email: customer.email,
    createdBy: session.userId ?? null,
  });
  const siteUrl = (env.SITE_URL ?? "https://zeus-service.de").replace(/\/$/, "");
  const link = `${siteUrl}/portal/einladung/${invite.token}`;
  const siteName = env.SITE_NAME ?? "Zeus-Service";
  const fromEmail = env.CONTACT_FROM_EMAIL ?? "website@zeus-service.de";
  const authorName = await signatureNameForUser(db, session.userId, session.username);
  const greeting = greetingFromForm(form, customer.name);
  const subject = `Zugang zum Kundenportal – ${siteName}`;
  const body = [
    "über diesen Link richten Sie Ihren Zugang zum Kundenportal ein.",
    "Danach sehen Sie Ihre Rechnungen, können PDFs öffnen und online bezahlen.",
    "",
    "Der Link ist 14 Tage gültig und nur für Sie bestimmt.",
  ].join("\n");

  const result = await sendEmail(env, {
    from: fromEmail,
    fromName: siteName,
    to: customer.email,
    toName: customer.name,
    replyTo: fromEmail,
    subject,
    html: renderReplyEmailHtml({
      siteName,
      siteUrl,
      recipientName: customer.name,
      subject,
      bodyText: body,
      authorName,
      fromEmail,
      replyToEmail: fromEmail,
      greeting,
      eyebrow: "Kundenportal",
      heading: "Zugang einrichten",
      ctaUrl: link,
      ctaLabel: "Portal einrichten",
      ctaFirst: true,
      footerNote: "Falls Sie die Einladung nicht erwartet haben, ignorieren Sie diese E-Mail.",
    }),
    text: renderReplyEmailText({
      siteName,
      siteUrl,
      recipientName: customer.name,
      subject,
      bodyText: `${body}\n\nLink: ${link}`,
      authorName,
      fromEmail,
      replyToEmail: fromEmail,
      greeting,
      ctaUrl: link,
      ctaLabel: "Portal einrichten",
      footerNote: "Falls Sie die Einladung nicht erwartet haben, ignorieren Sie diese E-Mail.",
    }),
  });

  if (result.via === "none" || result.error) {
    return ctx.redirect(`${back}?portal=mail-fail`, 303);
  }
  return ctx.redirect(`${back}?portal=sent`, 303);
}
