import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { blockTargets } from "../../../lib/blocks";
import { cfEnv } from "../../../lib/cf";
import {
  deleteContactRequest,
  deleteContactRequests,
  deleteRequestMailHistory,
  getContactRequest,
  getDb,
  listSpamRequestIds,
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

function parseIds(form: FormData): number[] {
  const raw = form.getAll("ids");
  const ids: number[] = [];
  for (const value of raw) {
    const id = Number.parseInt(String(value), 10);
    if (Number.isFinite(id) && id > 0) ids.push(id);
  }
  const single = Number.parseInt(String(form.get("id") ?? ""), 10);
  if (Number.isFinite(single) && single > 0) ids.push(single);
  return [...new Set(ids)];
}

async function learnAndBlock(
  db: D1Database,
  id: number,
): Promise<void> {
  const request = await getContactRequest(db, id);
  if (!request) return;
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
  const redirectTo = safeRedirect(
    String(form.get("redirect") ?? ""),
    "/admin/anfragen",
  );
  const ids = parseIds(form);

  try {
    if (action === "delete_all_spam") {
      const all = await listSpamRequestIds(db);
      await deleteContactRequests(db, all);
      return ctx.redirect(redirectTo, 303);
    }

    if (action === "bulk_delete_spam") {
      if (ids.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "Keine Auswahl." }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      for (const id of ids) {
        const request = await getContactRequest(db, id);
        if (request?.status === "spam") await deleteContactRequest(db, id);
      }
      return ctx.redirect(redirectTo, 303);
    }

    if (action === "bulk_learn_spam") {
      if (ids.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "Keine Auswahl." }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
      for (const id of ids) {
        const request = await getContactRequest(db, id);
        if (!request || request.status !== "spam") continue;
        await learnAndBlock(db, id);
        await deleteContactRequest(db, id);
      }
      return ctx.redirect(redirectTo, 303);
    }

    if (ids.length !== 1) {
      return new Response(
        JSON.stringify({ ok: false, error: "Ungültige ID." }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    const id = ids[0]!;

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
      await updateContactStatus(db, id, "spam");
      await learnAndBlock(db, id);
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
