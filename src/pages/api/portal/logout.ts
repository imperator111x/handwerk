import type { APIContext } from "astro";
import { destroyPortalSession } from "../../../lib/portal-auth";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  await destroyPortalSession(ctx);
  return ctx.redirect("/portal/login?portal=logout", 303);
}

export async function GET(ctx: APIContext): Promise<Response> {
  await destroyPortalSession(ctx);
  return ctx.redirect("/portal/login?portal=logout", 303);
}
