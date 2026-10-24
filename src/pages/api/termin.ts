import { cfEnv } from "../../lib/cf";
import type { APIContext } from "astro";
import {
  announceCancellation,
  bookSlot,
  cancelBooking,
  getBookingForRequest,
  getInviteByToken,
  isInviteToken,
} from "../../lib/appointments";
import { getDb } from "../../lib/db";

export const prerender = false;

function redirect(token: string, status: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: `/termin/${token}?status=${status}` },
  });
}

export async function POST(ctx: APIContext): Promise<Response> {
  const form = await ctx.request.formData();
  const token = String(form.get("token") ?? "");
  if (!isInviteToken(token)) return redirect("ungueltig", "invalid");

  const db = getDb(ctx);
  if (!db) return redirect(token, "db");
  const invite = await getInviteByToken(db, token);
  if (!invite) return redirect(token, "invalid");

  if (String(form.get("action") ?? "") === "cancel") {
    const existing = await getBookingForRequest(db, invite.request_id);
    if (!existing) return redirect(token, "missing");
    const booking = await cancelBooking(db, existing.id);
    if (!booking) return redirect(token, "missing");
    try {
      await announceCancellation(db, cfEnv(), booking, "customer", "Zeus-Service");
    } catch (err) {
      console.error("appointment_cancel_notice_failed", err);
    }
    return redirect(token, "cancelled");
  }

  const slotId = Number.parseInt(String(form.get("slot_id") ?? ""), 10);
  const firstName = String(form.get("first_name") ?? "").trim().slice(0, 80);
  const lastName = String(form.get("last_name") ?? "").trim().slice(0, 80);
  const street = String(form.get("street") ?? "").trim().slice(0, 160);
  const postalCode = String(form.get("postal_code") ?? "").trim().slice(0, 12);
  const city = String(form.get("city") ?? "").trim().slice(0, 80);

  if (!Number.isFinite(slotId) || slotId <= 0 || firstName.length < 2 || lastName.length < 2 || street.length < 3) {
    return redirect(token, "invalid");
  }

  try {
    const result = await bookSlot(db, {
      requestId: invite.request_id,
      slotId,
      inviteId: invite.id,
      firstName,
      lastName,
      street,
      postalCode: postalCode || null,
      city: city || null,
    });
    return redirect(token, result);
  } catch (err) {
    console.error("appointment_book_failed", err);
    return redirect(token, "db");
  }
}
