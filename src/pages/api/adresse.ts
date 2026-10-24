import type { APIContext } from "astro";
import { searchAddresses } from "../../lib/appointments";

export const prerender = false;

export async function GET(ctx: APIContext): Promise<Response> {
  const query = (ctx.url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (query.length < 3) {
    return Response.json({ results: [] });
  }
  try {
    const results = await searchAddresses(query);
    return Response.json(
      { results },
      { headers: { "cache-control": "private, max-age=30" } },
    );
  } catch (err) {
    console.error("address_search_failed", err);
    return Response.json({ results: [] });
  }
}
