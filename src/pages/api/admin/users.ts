import type { APIContext } from "astro";
import { hashPassword, requireSession } from "../../../lib/auth";
import {
  createUser,
  countUsers,
  deleteUser,
  findUserById,
  findUserByUsername,
  getDb,
  updateUserName,
  updateUserRole,
  USER_ROLES,
  type UserRole,
} from "../../../lib/db";
import { cleanPersonName } from "../../../lib/user-name";

export const prerender = false;

function safeRedirect(target: string | null, fallback: string): string {
  if (!target) return fallback;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;

  const db = getDb(ctx);
  if (!db) {
    return new Response(
      JSON.stringify({ ok: false, error: "D1 nicht verbunden." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }

  const form = await ctx.request.formData();
  const action = String(form.get("action") ?? "");
  const redirectBase = safeRedirect(
    String(form.get("redirect") ?? ""),
    "/admin/einstellungen",
  );
  const targetId = Number.parseInt(String(form.get("id") ?? ""), 10);
  const ownName =
    action === "name" && Number.isFinite(targetId) && targetId === session.userId;

  if (session.role !== "admin" && !ownName) {
    return new Response(
      JSON.stringify({ ok: false, error: "Nur Admins duerfen Nutzer verwalten." }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }

  try {
    if (action === "create") {
      const username = String(form.get("username") ?? "").trim().toLowerCase();
      const password = String(form.get("password") ?? "");
      const role = String(form.get("role") ?? "admin") as UserRole;
      const firstName = cleanPersonName(String(form.get("first_name") ?? ""));
      const lastName = cleanPersonName(String(form.get("last_name") ?? ""));

      if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
        return ctx.redirect(`${redirectBase}?user=bad_username`, 303);
      }
      if (!firstName || !lastName) {
        return ctx.redirect(`${redirectBase}?user=bad_name`, 303);
      }
      if (password.length < 10) {
        return ctx.redirect(`${redirectBase}?user=weak_password`, 303);
      }
      if (!USER_ROLES.includes(role)) {
        return ctx.redirect(`${redirectBase}?user=bad_role`, 303);
      }

      const existing = await findUserByUsername(db, username);
      if (existing) {
        return ctx.redirect(`${redirectBase}?user=exists`, 303);
      }

      const hash = await hashPassword(password);
      await createUser(db, {
        username,
        passwordHash: hash,
        role,
        firstName,
        lastName,
      });
      return ctx.redirect(`${redirectBase}?user=created`, 303);
    }

    if (action === "name") {
      const id = Number.parseInt(String(form.get("id") ?? ""), 10);
      const firstName = cleanPersonName(String(form.get("first_name") ?? ""));
      const lastName = cleanPersonName(String(form.get("last_name") ?? ""));
      if (!Number.isFinite(id) || id <= 0) {
        return ctx.redirect(`${redirectBase}?user=bad_id`, 303);
      }
      if (!firstName || !lastName) {
        return ctx.redirect(`${redirectBase}?user=bad_name`, 303);
      }
      if (session.role !== "admin" && id !== session.userId) {
        return ctx.redirect(`${redirectBase}?user=forbidden`, 303);
      }
      const target = await findUserById(db, id);
      if (!target) {
        return ctx.redirect(`${redirectBase}?user=not_found`, 303);
      }
      await updateUserName(db, id, firstName, lastName);
      return ctx.redirect(`${redirectBase}?user=name_saved`, 303);
    }

    if (action === "delete") {
      const id = Number.parseInt(String(form.get("id") ?? ""), 10);
      if (!Number.isFinite(id) || id <= 0) {
        return ctx.redirect(`${redirectBase}?user=bad_id`, 303);
      }
      if (id === session.userId) {
        return ctx.redirect(`${redirectBase}?user=self_delete`, 303);
      }
      const target = await findUserById(db, id);
      if (!target) {
        return ctx.redirect(`${redirectBase}?user=not_found`, 303);
      }
      if (target.role === "admin" && (await countAdmins(db)) <= 1) {
        return ctx.redirect(`${redirectBase}?user=last_admin`, 303);
      }
      await deleteUser(db, id);
      return ctx.redirect(`${redirectBase}?user=deleted`, 303);
    }

    if (action === "role") {
      const id = Number.parseInt(String(form.get("id") ?? ""), 10);
      const role = String(form.get("role") ?? "") as UserRole;
      if (!Number.isFinite(id) || id <= 0) {
        return ctx.redirect(`${redirectBase}?user=bad_id`, 303);
      }
      if (!USER_ROLES.includes(role)) {
        return ctx.redirect(`${redirectBase}?user=bad_role`, 303);
      }
      if (id === session.userId && role !== "admin") {
        return ctx.redirect(`${redirectBase}?user=self_demote`, 303);
      }
      const target = await findUserById(db, id);
      if (!target) {
        return ctx.redirect(`${redirectBase}?user=not_found`, 303);
      }
      if (
        target.role === "admin" &&
        role !== "admin" &&
        (await countAdmins(db)) <= 1
      ) {
        return ctx.redirect(`${redirectBase}?user=last_admin`, 303);
      }
      await updateUserRole(db, id, role);
      return ctx.redirect(`${redirectBase}?user=role_changed`, 303);
    }

    return ctx.redirect(`${redirectBase}?user=unknown_action`, 303);
  } catch (err) {
    console.error("admin_users_failed", err);
    return ctx.redirect(`${redirectBase}?user=error`, 303);
  }
}

async function countAdmins(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'`)
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}

// countUsers nicht entfernen – wird evtl. nachgeladen.
void countUsers;
