import { cfEnv } from "../../../lib/cf";
import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import {
  announceCancellation,
  berlinLocalToUnix,
  cancelBooking,
  createSlot,
  deleteFreeSlot,
} from "../../../lib/appointments";
import { getDb, signatureNameForUser } from "../../../lib/db";

export const prerender = false;

function safeRedirect(target: string | null): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) {
    return "/admin/termine";
  }
  return target;
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;

  const db = getDb(ctx);
  const form = await ctx.request.formData();
  const redirectTo = safeRedirect(String(form.get("redirect") ?? ""));
  if (!db) return ctx.redirect(`${redirectTo}?termin=db`, 303);

  const action = String(form.get("action") ?? "");
  try {
    if (action === "create") {
      const startsAt = berlinLocalToUnix(
        String(form.get("date") ?? ""),
        String(form.get("start") ?? ""),
      );
      const endsAt = berlinLocalToUnix(
        String(form.get("date") ?? ""),
        String(form.get("end") ?? ""),
      );
      const note = String(form.get("note") ?? "").trim().slice(0, 120);
      const now = Math.floor(Date.now() / 1000);
      if (!startsAt || !endsAt || endsAt <= startsAt || endsAt - startsAt > 8 * 3600) {
        return ctx.redirect(`${redirectTo}?termin=bad_time`, 303);
      }
      if (startsAt < now - 3600) {
        return ctx.redirect(`${redirectTo}?termin=past`, 303);
      }
      await createSlot(db, startsAt, endsAt, note || null);
      return ctx.redirect(`${redirectTo}?termin=created`, 303);
    }
    if (action === "delete") {
      const id = Number.parseInt(String(form.get("id") ?? ""), 10);
      const removed = Number.isFinite(id) && (await deleteFreeSlot(db, id));
      return ctx.redirect(`${redirectTo}?termin=${removed ? "deleted" : "busy"}`, 303);
    }
    if (action === "cancel") {
      const id = Number.parseInt(String(form.get("id") ?? ""), 10);
      const booking = Number.isFinite(id) ? await cancelBooking(db, id) : null;
      if (booking) {
        await announceCancellation(
          db,
          cfEnv(),
          booking,
          "admin",
          await signatureNameForUser(db, session.userId, session.username),
        );
      }
      return ctx.redirect(`${redirectTo}?termin=${booking ? "cancelled" : "missing"}`, 303);
    }
  } catch (err) {
    console.error("appointment_admin_failed", err);
    return ctx.redirect(`${redirectTo}?termin=db`, 303);
  }
  return ctx.redirect(`${redirectTo}?termin=bad`, 303);
}
