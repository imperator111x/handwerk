import type { APIContext } from "astro";
import { getDb } from "../../../lib/db";
import { readWorkPhoto } from "../../../lib/photos";

export const prerender = false;

export async function GET(ctx: APIContext): Promise<Response> {
  const id = Number.parseInt(ctx.params.id ?? "", 10);
  const db = getDb(ctx);
  if (!db || !Number.isFinite(id) || id <= 0) return new Response(null, { status: 404 });
  const photo = await readWorkPhoto(db, id);
  if (!photo) return new Response(null, { status: 404 });
  const copy = new ArrayBuffer(photo.bytes.byteLength);
  new Uint8Array(copy).set(photo.bytes);
  return new Response(copy, {
    headers: {
      "content-type": photo.contentType,
      "cache-control": "public, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
