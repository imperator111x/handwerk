import { getContactRequest, insertReply, updateContactStatus } from "./db";
import { renderReplyEmailHtml, renderReplyEmailText, sendEmail } from "./email";

const BERLIN = "Europe/Berlin";

export interface AppointmentSlot {
  id: number;
  starts_at: number;
  ends_at: number;
  note: string | null;
  created_at: number;
  booking_id: number | null;
  request_id: number | null;
  first_name: string | null;
  last_name: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
}

export interface AppointmentBooking {
  id: number;
  request_id: number;
  slot_id: number;
  invite_id: number | null;
  first_name: string;
  last_name: string;
  street: string;
  postal_code: string | null;
  city: string | null;
  created_at: number;
  starts_at: number;
  ends_at: number;
  note: string | null;
}

export interface AppointmentInvite {
  id: number;
  request_id: number;
  token: string;
  created_at: number;
  email_sent_at: number | null;
  email_status: string | null;
}

export interface AddressSuggestion {
  label: string;
  street: string;
  postalCode: string;
  city: string;
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isInviteToken(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

export function berlinLocalToUnix(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (
    !year ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let utc = desired;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(utc)).map((part) => [part.type, part.value]),
    );
    const seen = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const diff = desired - seen;
    if (diff === 0) return Math.floor(utc / 1000);
    utc += diff;
  }
  return null;
}

export function formatSlot(startsAt: number, endsAt: number): string {
  const date = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(startsAt * 1000));
  const time = new Intl.DateTimeFormat("de-DE", {
    timeZone: BERLIN,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date}, ${time.format(new Date(startsAt * 1000))}–${time.format(new Date(endsAt * 1000))} Uhr`;
}

export function formatAddress(booking: {
  street: string;
  postal_code: string | null;
  city: string | null;
}): string {
  const place = [booking.postal_code, booking.city].filter(Boolean).join(" ");
  return place ? `${booking.street}, ${place}` : booking.street;
}

export function splitPersonName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const SLOT_SELECT = `
  SELECT s.id, s.starts_at, s.ends_at, s.note, s.created_at,
         b.id AS booking_id, b.request_id, b.first_name, b.last_name,
         b.street, b.postal_code, b.city
  FROM appointment_slots s
  LEFT JOIN appointment_bookings b ON b.slot_id = s.id
`;

export async function listUpcomingSlots(
  db: D1Database,
  now = Math.floor(Date.now() / 1000),
): Promise<AppointmentSlot[]> {
  const { results } = await db
    .prepare(
      `${SLOT_SELECT}
       WHERE s.ends_at >= ?
       ORDER BY s.starts_at ASC
       LIMIT 200`,
    )
    .bind(now - 3600)
    .all<AppointmentSlot>();
  return results ?? [];
}

export async function listOpenSlots(
  db: D1Database,
  now = Math.floor(Date.now() / 1000),
): Promise<AppointmentSlot[]> {
  const { results } = await db
    .prepare(
      `${SLOT_SELECT}
       WHERE s.starts_at > ? AND b.id IS NULL
       ORDER BY s.starts_at ASC
       LIMIT 100`,
    )
    .bind(now)
    .all<AppointmentSlot>();
  return results ?? [];
}

export async function createSlot(
  db: D1Database,
  startsAt: number,
  endsAt: number,
  note: string | null,
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO appointment_slots (starts_at, ends_at, note) VALUES (?, ?, ?)`,
    )
    .bind(startsAt, endsAt, note)
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function deleteFreeSlot(db: D1Database, id: number): Promise<boolean> {
  const result = await db
    .prepare(
      `DELETE FROM appointment_slots
       WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM appointment_bookings WHERE slot_id = appointment_slots.id)`,
    )
    .bind(id)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function getInviteByToken(
  db: D1Database,
  token: string,
): Promise<AppointmentInvite | null> {
  const row = await db
    .prepare(`SELECT * FROM appointment_invites WHERE token = ? LIMIT 1`)
    .bind(token)
    .first<AppointmentInvite>();
  return row ?? null;
}

export async function getOrCreateInvite(
  db: D1Database,
  requestId: number,
): Promise<AppointmentInvite> {
  const existing = await db
    .prepare(
      `SELECT * FROM appointment_invites WHERE request_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .bind(requestId)
    .first<AppointmentInvite>();
  if (existing) return existing;
  const token = randomToken();
  const result = await db
    .prepare(`INSERT INTO appointment_invites (request_id, token) VALUES (?, ?)`)
    .bind(requestId, token)
    .run();
  return {
    id: Number(result.meta.last_row_id ?? 0),
    request_id: requestId,
    token,
    created_at: Math.floor(Date.now() / 1000),
    email_sent_at: null,
    email_status: null,
  };
}

export async function markInviteSent(
  db: D1Database,
  inviteId: number,
  status: string,
): Promise<void> {
  const sent = status.startsWith("sent:") ? 1 : 0;
  await db
    .prepare(
      `UPDATE appointment_invites
       SET email_status = ?, email_sent_at = CASE WHEN ? = 1 THEN unixepoch() ELSE email_sent_at END
       WHERE id = ?`,
    )
    .bind(status, sent, inviteId)
    .run();
}

export async function getBookingForRequest(
  db: D1Database,
  requestId: number,
): Promise<AppointmentBooking | null> {
  const row = await db
    .prepare(
      `SELECT b.*, s.starts_at, s.ends_at, s.note
       FROM appointment_bookings b
       JOIN appointment_slots s ON s.id = b.slot_id
       WHERE b.request_id = ?
       LIMIT 1`,
    )
    .bind(requestId)
    .first<AppointmentBooking>();
  return row ?? null;
}

export async function bookSlot(
  db: D1Database,
  input: {
    requestId: number;
    slotId: number;
    inviteId: number;
    firstName: string;
    lastName: string;
    street: string;
    postalCode: string | null;
    city: string | null;
  },
): Promise<"booked" | "taken" | "already" | "missing"> {
  const existing = await getBookingForRequest(db, input.requestId);
  if (existing) return "already";

  const slot = await db
    .prepare(`SELECT id, starts_at FROM appointment_slots WHERE id = ? LIMIT 1`)
    .bind(input.slotId)
    .first<{ id: number; starts_at: number }>();
  if (!slot || slot.starts_at <= Math.floor(Date.now() / 1000)) return "missing";

  try {
    const result = await db
      .prepare(
        `INSERT INTO appointment_bookings
           (request_id, slot_id, invite_id, first_name, last_name, street, postal_code, city)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM appointment_bookings WHERE slot_id = ?)
           AND NOT EXISTS (SELECT 1 FROM appointment_bookings WHERE request_id = ?)`,
      )
      .bind(
        input.requestId,
        input.slotId,
        input.inviteId,
        input.firstName,
        input.lastName,
        input.street,
        input.postalCode,
        input.city,
        input.slotId,
        input.requestId,
      )
      .run();
    if (Number(result.meta.changes ?? 0) < 1) return "taken";
  } catch (err) {
    const message = String(err).toLowerCase();
    if (message.includes("unique") && message.includes("slot")) return "taken";
    if (message.includes("unique")) return "already";
    throw err;
  }

  const request = await getContactRequest(db, input.requestId);
  if (request && (request.status === "new" || request.status === "archived" || request.status === "done")) {
    await updateContactStatus(db, input.requestId, "in_progress");
  }
  return "booked";
}

export async function cancelBooking(
  db: D1Database,
  bookingId: number,
): Promise<AppointmentBooking | null> {
  const booking = await db
    .prepare(
      `SELECT b.*, s.starts_at, s.ends_at, s.note
       FROM appointment_bookings b
       JOIN appointment_slots s ON s.id = b.slot_id
       WHERE b.id = ?
       LIMIT 1`,
    )
    .bind(bookingId)
    .first<AppointmentBooking>();
  if (!booking) return null;
  const result = await db
    .prepare(`DELETE FROM appointment_bookings WHERE id = ?`)
    .bind(bookingId)
    .run();
  if (Number(result.meta.changes ?? 0) < 1) return null;
  return booking;
}

export async function announceCancellation(
  db: D1Database,
  env: Env | undefined,
  booking: AppointmentBooking,
  side: "customer" | "admin",
  authorName: string,
): Promise<void> {
  const request = await getContactRequest(db, booking.request_id);
  const when = formatSlot(booking.starts_at, booking.ends_at);
  const byCustomer = side === "customer";
  const subject = "Termin storniert";
  const body = byCustomer
    ? `der Termin am ${when} wurde storniert. Über denselben Link können Sie einen neuen Termin wählen.`
    : `der Termin am ${when} wurde von uns storniert. Über denselben Link können Sie einen neuen Termin wählen.`;
  const siteName = env?.SITE_NAME ?? "Zeus-Service";
  const siteUrl = env?.SITE_URL ?? "https://zeus-service.de";
  const fromEmail = env?.CONTACT_FROM_EMAIL ?? "website@zeus-service.de";

  let emailSentAt: number | null = null;
  let emailStatus = byCustomer ? "received" : "skipped:no_env";
  try {
  if (env && request?.email) {
    const result = await sendEmail(env, {
      from: fromEmail,
      fromName: siteName,
      to: request.email,
      toName: request.name,
      replyTo: fromEmail,
      subject: `${subject} – ${siteName}`,
      html: renderReplyEmailHtml({
        siteName,
        siteUrl,
        recipientName: request.name,
        subject,
        bodyText: body,
        authorName,
        fromEmail,
      }),
      text: renderReplyEmailText({
        siteName,
        siteUrl,
        recipientName: request.name,
        subject,
        bodyText: body,
        authorName,
        fromEmail,
      }),
    });
    if (result.ok && !byCustomer) {
      emailSentAt = Math.floor(Date.now() / 1000);
      emailStatus = `sent:${result.via}`;
    } else if (!result.ok && !byCustomer) {
      emailStatus = result.via === "none" ? "skipped:no_transport" : `failed:${result.via}`;
    }
  }

  await insertReply(db, {
    request_id: booking.request_id,
    user_id: null,
    author_name: byCustomer ? `${booking.first_name} ${booking.last_name}` : authorName,
    subject,
    body: byCustomer
      ? `Der Kunde hat den Termin storniert: ${when}, ${formatAddress(booking)}.`
      : `Der Termin wurde storniert: ${when}, ${formatAddress(booking)}.`,
    email_sent_at: emailSentAt,
    email_status: emailStatus,
    direction: byCustomer ? "inbound" : "outbound",
    from_email: byCustomer ? request?.email ?? null : fromEmail,
  });
  } catch (err) {
    console.error("appointment_cancel_notice_failed", err);
  }
}

interface PhotonFeature {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    locality?: string;
    osm_key?: string;
    osm_value?: string;
  };
}

export function suggestionsFromPhoton(payload: { features?: PhotonFeature[] }): AddressSuggestion[] {
  const seen = new Set<string>();
  const suggestions: AddressSuggestion[] = [];
  for (const feature of payload.features ?? []) {
    const props = feature.properties ?? {};
    const streetName =
      props.street ||
      (props.osm_key === "highway" || props.osm_value === "house" ? props.name : "") ||
      "";
    const street = [streetName, props.housenumber].filter(Boolean).join(" ").trim();
    const city = props.city || props.town || props.village || props.locality || "";
    const postalCode = props.postcode || "";
    if (street.length < 2) continue;
    const place = [postalCode, city].filter(Boolean).join(" ");
    const label = place ? `${street}, ${place}` : street;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ label, street, postalCode, city });
    if (suggestions.length >= 6) break;
  }
  return suggestions;
}

export async function searchAddresses(query: string): Promise<AddressSuggestion[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("lang", "de");
  url.searchParams.set("limit", "8");
  url.searchParams.set("lat", "53.68");
  url.searchParams.set("lon", "10.01");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Zeus-Service/1.0 (https://zeus-service.de)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { features?: PhotonFeature[] };
  return suggestionsFromPhoton(payload);
}
