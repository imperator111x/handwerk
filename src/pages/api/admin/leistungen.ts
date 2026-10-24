import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { deleteCatalogItem, parseCatalogForm, saveCatalogItem } from "../../../lib/catalog";
import { getDb } from "../../../lib/db";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const db = getDb(ctx);
  if (!db) return ctx.redirect("/admin/leistungen?katalog=db", 303);
  const form = await ctx.request.formData();
  const action = String(form.get("action") ?? "save");

  if (action === "delete") {
    const id = Number.parseInt(String(form.get("id") ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) return ctx.redirect("/admin/leistungen?katalog=missing", 303);
    await deleteCatalogItem(db, id);
    return ctx.redirect("/admin/leistungen?katalog=deleted", 303);
  }

  const parsed = parseCatalogForm(form);
  if (!parsed) return ctx.redirect("/admin/leistungen?katalog=bad", 303);
  await saveCatalogItem(db, parsed);
  return ctx.redirect(`/admin/leistungen?katalog=${parsed.id ? "saved" : "created"}`, 303);
}
