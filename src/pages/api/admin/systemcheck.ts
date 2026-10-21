import type { APIContext } from "astro";
import { cfEnv } from "../../../lib/cf";
import { requireSession } from "../../../lib/auth";
import { getDb, signatureNameForUser } from "../../../lib/db";
import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "../../../lib/email";
import { parseTaxNumber } from "../../../lib/invoice";
import { getTaxNumber, sendInvoiceEmail } from "../../../lib/invoices";
import { berlinTodayIso } from "../../../lib/offers";
import { greetingFor } from "../../../lib/salutation";
import { createStripePaymentLink, paymentLinkForMail, stripeKeyMode } from "../../../lib/stripe-pay";
import {
  SYSTEM_CHECK_BUYER,
  SYSTEM_CHECK_FOOTER,
  SYSTEM_CHECK_SHORT_FOOTER,
  SYSTEM_CHECK_SHORT_SUBJECT,
  SYSTEM_CHECK_STRIPE_INVOICE_ID,
  SYSTEM_CHECK_TITLE,
  parseTestRecipient,
  renderSystemCheckPdf,
  systemCheckMayLink,
  systemCheckSentMessage,
  systemCheckShortText,
} from "../../../lib/system-check";

export const prerender = false;

function json(body: { ok: boolean; message: string }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function redact(value: string): string {
  return value.replace(/[sr]k_(?:test|live)_[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  if (session.role !== "admin") return json({ ok: false, message: "Nur ein Admin kann Testmails senden." }, 403);

  const env = cfEnv();
  if (!env.EMAIL && !env.RESEND_API_KEY) {
    return json({ ok: false, message: "Es ist kein E-Mail-Versand verbunden." }, 400);
  }

  const form = await ctx.request.formData();
  const kind = String(form.get("kind") ?? "");
  const to = parseTestRecipient(String(form.get("to") ?? ""));
  if (!to) return json({ ok: false, message: "Bitte eine gültige E-Mail-Adresse angeben." }, 400);
  if (kind !== "kurz" && kind !== "rechnung") return json({ ok: false, message: "Unbekannte Testmail." }, 400);

  const db = getDb(ctx);
  const authorName = db
    ? await signatureNameForUser(db, session.userId, session.username)
    : session.username;
  const siteName = env.SITE_NAME ?? "Zeus-Service";
  const from = "info@zeus-service.de";

  if (kind === "kurz") {
    const mail = {
      siteName,
      siteUrl: env.SITE_URL ?? "https://zeus-service.de",
      recipientName: "Test",
      subject: SYSTEM_CHECK_SHORT_SUBJECT,
      authorName: authorName || siteName,
      fromEmail: from,
      replyToEmail: from,
      heading: "Testmail",
      eyebrow: "Systemcheck",
      greeting: "Guten Tag,",
      footerNote: SYSTEM_CHECK_SHORT_FOOTER,
      bodyText: systemCheckShortText(),
    };
    const result = await sendEmail(env, {
      from: env.CONTACT_FROM_EMAIL ?? "website@zeus-service.de",
      fromName: siteName,
      to,
      replyTo: from,
      subject: SYSTEM_CHECK_SHORT_SUBJECT,
      html: renderReplyEmailHtml(mail),
      text: renderReplyEmailText(mail),
    });
    if (!result.ok) return json({ ok: false, message: "Die Testmail konnte nicht verschickt werden." }, 502);
    return json({ ok: true, message: systemCheckSentMessage({ kind, to, mode: "off", link: false, linkFailed: false }) });
  }

  const taxNumber = db ? await getTaxNumber(db) : "";
  if (!parseTaxNumber(taxNumber)) {
    return json({ ok: false, message: "Bitte zuerst die Steuernummer speichern." }, 400);
  }

  const mode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  let paymentUrl = "";
  let linkFailed = false;
  if (systemCheckMayLink(mode) && env.STRIPE_SECRET_KEY) {
    try {
      const link = await createStripePaymentLink(env.STRIPE_SECRET_KEY, {
        invoiceId: SYSTEM_CHECK_STRIPE_INVOICE_ID,
        number: "R-TEST-0000",
        title: SYSTEM_CHECK_TITLE,
        amountCents: 12750,
        email: to,
      });
      paymentUrl = paymentLinkForMail(link.url, to);
    } catch (error) {
      linkFailed = true;
      console.error("system_check_link_failed", redact(error instanceof Error ? error.message : "error"));
    }
  }

  const today = berlinTodayIso();
  const pdf = renderSystemCheckPdf({ today, taxNumber, buyerEmail: to, authorName: authorName || siteName });
  const sent = await sendInvoiceEmail(env, {
    to,
    recipientName: SYSTEM_CHECK_BUYER,
    authorName: authorName || siteName,
    greeting: greetingFor("herren_damen", SYSTEM_CHECK_BUYER),
    invoice: pdf.invoice,
    taxNumber,
    filename: pdf.filename,
    pdf: pdf.bytes,
    number: pdf.number,
    paymentUrl,
    paymentStatus: "offen",
    paymentMode: paymentUrl ? "test" : "off",
    footerNote: SYSTEM_CHECK_FOOTER,
  });
  if (!sent.sentAt) return json({ ok: false, message: "Die Testrechnung konnte nicht verschickt werden." }, 502);
  return json({
    ok: true,
    message: systemCheckSentMessage({ kind, to, mode, link: Boolean(paymentUrl), linkFailed }),
  });
}
