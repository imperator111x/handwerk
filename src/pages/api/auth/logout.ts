import type { APIContext } from "astro";
import { destroySession } from "../../../lib/auth";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  await destroySession(ctx);
  return ctx.redirect("/login", 303);
}

export const GET = POST;
