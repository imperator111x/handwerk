import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { blockTargets } from "../../../lib/blocks";
import { cfEnv } from "../../../lib/cf";
import {
  deleteContactRequest,
  deleteRequestMailHistory,
  getContactRequest,
  getDb,
  updateContactStatus,
  type ContactStatus,
} from "../../../lib/db";
import { removeStoredFiles } from "../../../lib/mail-files";
import { learnFromSpamRequest } from "../../../lib/spam-learn";

export const prerender = false;

const validStatuses: ContactStatus[] = [
  "new",
  "in_progress",
  "done",
  "archived",
  "spam",
];

function safeRedirect(target: string | null, fallback: string): string {
  if (!target) return fallback;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;

  const db = getDb(ctx);
  if (!db) {
    return new Response(
      JSON.stringify({ ok: false, error: "D1 nicht verbunden." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const form = await ctx.request.formData();
  const action = String(form.get("action") ?? "");
  const idRaw = String(form.get("id") ?? "");
  const id = Number.parseInt(idRaw, 10);
  const redirectTo = safeRedirect(
    String(form.get("redirect") ?? ""),
    "/admin/anfragen",
  );

  if (!Number.isFinite(id) || id <= 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "Ungültige ID." }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  try {
    if (action === "status") {
      const status = String(form.get("status") ?? "") as ContactStatus;
      if (!validStatuses.includes(status)) {
        return new Response(
          JSON.stringify({ ok: false, error: "Ungültiger Status." }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      await updateContactStatus(db, id, status);
    } else if (action === "release_spam") {
      await updateContactStatus(db, id, "new");
    } else if (action === "mark_spam") {
      const request = await getContactRequest(db, id);
      if (request) {
        await updateContactStatus(db, id, "spam");
        await learnFromSpamRequest(db, {
          email: request.email,
          message: request.message,
          reason: request.spam_reason,
          note: `Anfrage #${id}`,
        });
        await blockTargets(db, {
          email: request.email,
          note: `Spam Anfrage #${id}`,
        });
      }
    } else if (action === "delete") {
      await deleteContactRequest(db, id);
    } else if (action === "delete_history") {
      const keys = await deleteRequestMailHistory(db, id);
      await removeStoredFiles(cfEnv(), keys);
      const url = new URL(redirectTo, "https://zeus-service.de");
      url.searchParams.set("verlauf", "deleted");
      return ctx.redirect(`${url.pathname}${url.search}`, 303);
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: "Unbekannte Aktion." }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
  } catch (err) {
    console.error("admin_contact_update_failed", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Datenbankfehler." }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  return ctx.redirect(redirectTo, 303);
}
