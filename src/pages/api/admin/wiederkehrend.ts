import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getCustomer } from "../../../lib/customers";
import { getDb, signatureNameForUser } from "../../../lib/db";
import { addIsoDays, INVOICE_DEFAULT_INTRO } from "../../../lib/invoice";
import { getTaxNumber, saveInvoice } from "../../../lib/invoices";
import { berlinTodayIso } from "../../../lib/offers";
import { offerTotalCents } from "../../../lib/quote";
import { greetingFromForm } from "../../../lib/salutation";
import {
  deleteRecurringService,
  getRecurringService,
  markRecurringInvoiced,
  parseRecurringForm,
  recurringToLine,
  saveRecurringService,
} from "../../../lib/recurring";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  if (!db) return ctx.redirect("/admin/wiederkehrend?ok=db", 303);

  const form = await ctx.request.formData();
  const action = String(form.get("action") ?? "save");
  const id = Number.parseInt(String(form.get("id") ?? ""), 10);

  if (action === "delete") {
    if (!Number.isFinite(id) || id <= 0) return ctx.redirect("/admin/wiederkehrend?ok=missing", 303);
    await deleteRecurringService(db, id);
    return ctx.redirect("/admin/wiederkehrend?ok=deleted", 303);
  }

  if (action === "draft") {
    if (!Number.isFinite(id) || id <= 0) return ctx.redirect("/admin/wiederkehrend?ok=missing", 303);
    const row = await getRecurringService(db, id);
    if (!row || !row.active) return ctx.redirect("/admin/wiederkehrend?ok=missing", 303);
    const customer = await getCustomer(db, row.customer_id);
    if (!customer) return ctx.redirect("/admin/wiederkehrend?ok=missing", 303);
    const taxNumber = await getTaxNumber(db);
    if (!taxNumber) return ctx.redirect("/admin/wiederkehrend?ok=tax", 303);
    const street = customer.street?.trim() ?? "";
    const postalCode = customer.postal_code?.trim() ?? "";
    const city = customer.city?.trim() ?? "";
    if (!street || !postalCode || !city) {
      return ctx.redirect(`/admin/kunden/${customer.id}?kunde=bad`, 303);
    }
    const today = berlinTodayIso();
    const line = recurringToLine(row);
    const priceCents = offerTotalCents([line]);
    if (priceCents <= 0) return ctx.redirect("/admin/wiederkehrend?ok=price", 303);
    const authorName = await signatureNameForUser(db, session.userId, session.username);
    const buyerName = customer.name;
    const greeting = greetingFromForm(new FormData(), buyerName);
    const invoiceId = await saveInvoice(db, {
      customerId: customer.id,
      quoteId: null,
      invoice: {
        title: row.label,
        intro: INVOICE_DEFAULT_INTRO,
        lines: [line],
        invoiceDate: today,
        serviceDate: row.next_due <= today ? row.next_due : today,
        dueDate: addIsoDays(today, 14),
        priceCents,
      },
      greeting,
      taxNumber,
      buyer: {
        name: buyerName,
        email: customer.email,
        phone: customer.phone,
        street,
        postalCode,
        city,
      },
      createdAt: Math.floor(Date.now() / 1000),
    });
    await markRecurringInvoiced(db, row.id, invoiceId);
    void authorName;
    return ctx.redirect(`/admin/rechnungen/${invoiceId}?rechnung=draft`, 303);
  }

  const parsed = await parseRecurringForm(db, form);
  if (!parsed) return ctx.redirect("/admin/wiederkehrend?ok=bad", 303);
  const savedId = await saveRecurringService(db, parsed);
  return ctx.redirect(`/admin/wiederkehrend?ok=saved&edit=${savedId}`, 303);
}
