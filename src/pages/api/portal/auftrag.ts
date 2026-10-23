import type { APIContext } from "astro";
import { cfEnv } from "../../../lib/cf";
import { getCustomer } from "../../../lib/customers";
import { getDb, insertContactRequest } from "../../../lib/db";
import { decodeHtmlEntities } from "../../../lib/html-entities";
import {
  readPlainImageUploads,
  scanStoredFiles,
  storeInboundFiles,
  uploadsAsAttachments,
} from "../../../lib/mail-files";
import { notifyStaff } from "../../../lib/notify";
import { requirePortalSession } from "../../../lib/portal-auth";

export const prerender = false;

function cleanText(value: FormDataEntryValue | null, max: number): string {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, max);
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requirePortalSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const env = cfEnv();
  if (!db || !env?.FILES) return ctx.redirect("/portal/auftrag?auftrag=db", 303);

  const form = await ctx.request.formData();
  const title = cleanText(form.get("title"), 120);
  const message = cleanText(form.get("message"), 4000);
  if (title.length < 3) return ctx.redirect("/portal/auftrag?auftrag=title", 303);
  if (message.length < 5) return ctx.redirect("/portal/auftrag?auftrag=message", 303);

  const images = await readPlainImageUploads(form.getAll("photos"), { maxFiles: 6 });
  if (images === "too-many") return ctx.redirect("/portal/auftrag?auftrag=files", 303);
  if (images === "too-large") return ctx.redirect("/portal/auftrag?auftrag=size", 303);
  if (images === "bad") return ctx.redirect("/portal/auftrag?auftrag=image", 303);

  const customer = await getCustomer(db, session.customerId);
  if (!customer) return ctx.redirect("/portal/login?portal=bad", 303);

  const requestId = await insertContactRequest(db, {
    name: decodeHtmlEntities(customer.name),
    email: customer.email,
    phone: customer.phone,
    topic: title,
    message,
    ip: ctx.request.headers.get("cf-connecting-ip"),
    country: ctx.request.headers.get("cf-ipcountry"),
    user_agent: ctx.request.headers.get("user-agent"),
    source: "portal",
    customerId: session.customerId,
  });
  if (!requestId) return ctx.redirect("/portal/auftrag?auftrag=db", 303);

  if (images.length > 0) {
    const stored = await storeInboundFiles(db, env.FILES, { requestId }, uploadsAsAttachments(images));
    await scanStoredFiles(env, stored, { poll: true }).catch((err) => {
      console.error("portal_job_scan_failed", err instanceof Error ? err.message : "error");
    });
  }

  await notifyStaff(env, {
    title: "Neuer Auftrag aus dem Portal",
    body: `${customer.name}: ${title}`,
    url: `/admin/anfragen/${requestId}`,
  }).catch(() => {});

  return ctx.redirect("/portal/auftrag?auftrag=sent", 303);
}
