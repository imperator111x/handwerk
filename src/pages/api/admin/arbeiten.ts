import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { deleteWorkPhoto, insertWorkPhoto } from "../../../lib/photos";

export const prerender = false;

function redirect(ctx: APIContext, flag: string): Response {
  return ctx.redirect(`/admin/arbeiten?foto=${flag}`, 303);
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const db = getDb(ctx);
  if (!db) return redirect(ctx, "db");

  const form = await ctx.request.formData();
  const action = String(form.get("action") ?? "upload");
  if (action === "delete") {
    const id = Number.parseInt(String(form.get("id") ?? ""), 10);
    if (!Number.isFinite(id) || id <= 0) return redirect(ctx, "missing");
    await deleteWorkPhoto(db, id);
    return redirect(ctx, "deleted");
  }

  const title = String(form.get("title") ?? "").trim();
  const caption = String(form.get("caption") ?? "").trim();
  const file = form.get("image");
  if (title.length < 2 || title.length > 80) return redirect(ctx, "bad_title");
  if (caption.length > 240) return redirect(ctx, "bad_caption");
  if (!(file instanceof File) || file.size === 0) return redirect(ctx, "bad_file");
  if (file.type !== "image/jpeg") return redirect(ctx, "bad_file");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const saved = await insertWorkPhoto(db, { title, caption, bytes });
  if (saved === "large") return redirect(ctx, "large");
  if (saved === "full") return redirect(ctx, "full");
  return redirect(ctx, "saved");
}
