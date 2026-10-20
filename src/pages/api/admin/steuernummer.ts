import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { parseTaxNumber } from "../../../lib/invoice";
import { saveTaxNumber } from "../../../lib/invoices";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const db = getDb(ctx);
  if (!db) return ctx.redirect("/admin/einstellungen?steuer=db", 303);
  const form = await ctx.request.formData();
  const taxNumber = parseTaxNumber(String(form.get("tax_number") ?? ""));
  if (!taxNumber) return ctx.redirect("/admin/einstellungen?steuer=bad", 303);
  await saveTaxNumber(db, taxNumber);
  return ctx.redirect("/admin/einstellungen?steuer=saved", 303);
}
