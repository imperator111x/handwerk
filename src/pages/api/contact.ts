import type { APIContext } from "astro";
import { parseContact } from "../../lib/validation";
import { insertContactRequest } from "../../lib/db";

export const prerender = false;

export async function POST(ctx: APIContext): Promise<Response> {
  const contentType = ctx.request.headers.get("content-type") ?? "";
  let formData: FormData;
  try {
    if (contentType.includes("application/json")) {
      const json = (await ctx.request.json()) as Record<string, unknown>;
      formData = new FormData();
      for (const [k, v] of Object.entries(json)) {
        if (v != null) formData.append(k, String(v));
      }
    } else {
      formData = await ctx.request.formData();
    }
  } catch (_err) {
    return json({ ok: false, error: "Ungültige Anfrage." }, 400);
  }

  const parsed = parseContact(formData);
  if (!parsed.ok) {
    return json({ ok: false, error: parsed.error }, 400);
  }

  const payload = parsed.value;
  const env = ctx.locals.runtime?.env;

  const ip =
    ctx.request.headers.get("cf-connecting-ip") ??
    ctx.request.headers.get("x-forwarded-for") ??
    "unknown";
  const country = ctx.request.headers.get("cf-ipcountry") ?? "unknown";
  const userAgent = ctx.request.headers.get("user-agent") ?? "unknown";

  const log = {
    at: new Date().toISOString(),
    ip,
    country,
    userAgent,
    ...payload,
  };
  console.log("contact_form_submission", JSON.stringify(log));

  let persistedId: number | null = null;
  if (env?.DB) {
    try {
      persistedId = await insertContactRequest(env.DB, {
        ...payload,
        ip,
        country,
        user_agent: userAgent,
      });
    } catch (err) {
      console.error("contact_persist_failed", err);
    }
  }

  if (env?.RESEND_API_KEY && env.CONTACT_TO_EMAIL) {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.CONTACT_FROM_EMAIL ?? "website@zeus-service.de",
          to: [env.CONTACT_TO_EMAIL],
          reply_to: payload.email,
          subject: `Neue Anfrage: ${payload.topic} – ${payload.name}`,
          text: renderPlainMail(payload),
        }),
      });
      if (!resp.ok) {
        const body = await resp.text();
        console.error("resend_error", resp.status, body);
      }
    } catch (err) {
      console.error("resend_exception", err);
    }
  }

  return json({
    ok: true,
    id: persistedId,
    message:
      "Vielen Dank für Ihre Anfrage – wir melden uns in Kürze bei Ihnen.",
  });
}

export function GET(): Response {
  return json({ ok: false, error: "Methode nicht erlaubt." }, 405);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderPlainMail(payload: {
  name: string;
  email: string;
  phone?: string;
  topic: string;
  message: string;
}): string {
  return [
    "Neue Anfrage über zeus-service.de",
    "----------------------------------",
    `Name:    ${payload.name}`,
    `E-Mail:  ${payload.email}`,
    `Telefon: ${payload.phone ?? "–"}`,
    `Thema:   ${payload.topic}`,
    "",
    "Nachricht:",
    payload.message,
  ].join("\n");
}
