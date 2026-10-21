import type { APIContext } from "astro";
import { requireSession } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { decodeHtmlEntities } from "../../../lib/html-entities";
import { getCustomer } from "../../../lib/customers";
import {
  bytesToBase64,
  decodeSignatureJpeg,
  jpegSize,
  parseTimesheetForm,
  timesheetContentHash,
} from "../../../lib/timesheet";
import {
  deleteTimesheet,
  getTimesheet,
  insertTimesheet,
  signTimesheet,
  timesheetContent,
  updateTimesheet,
} from "../../../lib/timesheets";

export const prerender = false;

function customerIdFrom(form: FormData): number | null {
  const id = Number.parseInt(String(form.get("customer_id") ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(ctx: APIContext): Promise<Response> {
  const sessionOrRedirect = await requireSession(ctx);
  if (sessionOrRedirect instanceof Response) return sessionOrRedirect;
  const session = sessionOrRedirect;
  const db = getDb(ctx);
  const form = await ctx.request.formData();
  const action = String(form.get("action") ?? "create");
  if (!db) return ctx.redirect("/admin/stundenzettel?zettel=db", 303);

  if (action === "delete") {
    const id = Number.parseInt(String(form.get("id") ?? ""), 10);
    if (!Number.isFinite(id) || !(await deleteTimesheet(db, id))) {
      return ctx.redirect("/admin/stundenzettel?zettel=locked", 303);
    }
    return ctx.redirect("/admin/stundenzettel?zettel=deleted", 303);
  }

  if (action === "sign") {
    const id = Number.parseInt(String(form.get("id") ?? ""), 10);
    const row = Number.isFinite(id) ? await getTimesheet(db, id) : null;
    if (!row) return ctx.redirect("/admin/stundenzettel?zettel=missing", 303);
    if (row.signed_at) return ctx.redirect(`/admin/stundenzettel/${row.id}?zettel=locked`, 303);
    const signerName = String(form.get("employee_name") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const employeeJpeg = decodeSignatureJpeg(String(form.get("employee_jpeg") ?? ""));
    if (signerName.length < 2 || !employeeJpeg || !jpegSize(employeeJpeg)) {
      return ctx.redirect(`/admin/stundenzettel/${row.id}?zettel=sign`, 303);
    }
    const customerName = String(form.get("customer_name") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    const customerJpeg = decodeSignatureJpeg(String(form.get("customer_jpeg") ?? ""));
    if ((customerName.length > 0 || customerJpeg) && (customerName.length < 2 || !customerJpeg || !jpegSize(customerJpeg))) {
      return ctx.redirect(`/admin/stundenzettel/${row.id}?zettel=sign`, 303);
    }
    const hash = await timesheetContentHash(timesheetContent(row));
    const storedEmployee = bytesToBase64(employeeJpeg);
    const storedCustomer = customerJpeg ? bytesToBase64(customerJpeg) : "";
    const ok = await signTimesheet(db, row.id, {
      hash,
      signedAt: Math.floor(Date.now() / 1000),
      signerName,
      signatureJpeg: storedEmployee,
      customerSignerName: customerJpeg ? customerName : "",
      customerSignatureJpeg: storedCustomer,
    });
    if (!ok) return ctx.redirect(`/admin/stundenzettel/${row.id}?zettel=locked`, 303);
    return ctx.redirect(`/admin/stundenzettel/${row.id}?zettel=signed`, 303);
  }

  const parsed = parseTimesheetForm(form);
  const backId = Number.parseInt(String(form.get("id") ?? ""), 10);
  const back = action === "update" && Number.isFinite(backId) ? `/admin/stundenzettel/${backId}` : "/admin/stundenzettel/neu";
  if (!parsed) return ctx.redirect(`${back}?zettel=bad`, 303);
  let customerId = customerIdFrom(form);
  if (customerId) {
    const customer = await getCustomer(db, customerId);
    if (!customer) customerId = null;
    else if (!parsed.customerName) parsed.customerName = decodeHtmlEntities(customer.name);
  }

  if (action === "update") {
    if (!Number.isFinite(backId) || !(await updateTimesheet(db, backId, { ...parsed, customerId }))) {
      return ctx.redirect(`/admin/stundenzettel/${Number.isFinite(backId) ? backId : ""}?zettel=locked`, 303);
    }
    return ctx.redirect(`/admin/stundenzettel/${backId}?zettel=saved`, 303);
  }

  const id = await insertTimesheet(db, {
    ...parsed,
    customerId,
    userId: session.userId ?? null,
  });
  if (!id) return ctx.redirect("/admin/stundenzettel/neu?zettel=db", 303);
  return ctx.redirect(`/admin/stundenzettel/${id}?zettel=saved`, 303);
}
