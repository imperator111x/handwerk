import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { deleteCustomer, getCustomer, parseCustomerForm, createCustomer, updateCustomer } from "../../../lib/customers";
import { getDb } from "../../../lib/db";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const db = getDb(ctx);
  const form = await ctx.request.formData();
  const action = String(form.get("action") ?? "");
  const id = Number.parseInt(String(form.get("id") ?? ""), 10);
  const hasId = Number.isFinite(id) && id > 0;
  if (!db) return ctx.redirect("/admin/kunden?kunde=db", 303);

  if (action === "delete") {
    if (!hasId) return ctx.redirect("/admin/kunden?kunde=missing", 303);
    const existing = await getCustomer(db, id);
    if (!existing) return ctx.redirect("/admin/kunden?kunde=missing", 303);
    await deleteCustomer(db, id);
    return ctx.redirect("/admin/kunden?kunde=deleted", 303);
  }

  const input = parseCustomerForm(form);
  if (!input) {
    const back = action === "update" && hasId ? `/admin/kunden/${id}?kunde=bad` : "/admin/kunden/neu?kunde=bad";
    return ctx.redirect(back, 303);
  }

  if (action === "create") {
    const created = await createCustomer(db, input);
    if (!created) return ctx.redirect("/admin/kunden/neu?kunde=db", 303);
    return ctx.redirect(`/admin/kunden/${created}?kunde=saved`, 303);
  }

  if (action === "update" && hasId) {
    const existing = await getCustomer(db, id);
    if (!existing) return ctx.redirect("/admin/kunden?kunde=missing", 303);
    await updateCustomer(db, id, input);
    return ctx.redirect(`/admin/kunden/${id}?kunde=saved`, 303);
  }

  return ctx.redirect("/admin/kunden?kunde=bad", 303);
}
