import { getCatalogItem } from "./catalog";
import { berlinTodayIso } from "./offers";
import { isOfferUnit, lineTotalCents, type OfferLine, type OfferUnit } from "./quote";

export interface RecurringService {
  id: number;
  customer_id: number;
  catalog_item_id: number | null;
  label: string;
  unit: OfferUnit;
  unit_cents: number;
  quantity: number;
  interval_months: number;
  next_due: string;
  active: number;
  last_invoice_id: number | null;
  note: string | null;
  created_at: number;
  updated_at: number | null;
}

export interface RecurringListItem extends RecurringService {
  customer_name: string;
  customer_email: string;
}

const COLUMNS =
  "id, customer_id, catalog_item_id, label, unit, unit_cents, quantity, interval_months, next_due, active, last_invoice_id, note, created_at, updated_at";

function asUnit(unit: string): OfferUnit | null {
  return isOfferUnit(unit) ? unit : null;
}

export async function listRecurringServices(
  db: D1Database,
  options: { dueOnly?: boolean; customerId?: number } = {},
): Promise<RecurringListItem[]> {
  const today = berlinTodayIso();
  const clauses: string[] = [];
  const binds: Array<string | number> = [];
  if (options.customerId) {
    clauses.push("r.customer_id = ?");
    binds.push(options.customerId);
  }
  if (options.dueOnly) {
    clauses.push("r.active = 1");
    clauses.push("r.next_due <= ?");
    binds.push(today);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { results } = await db
    .prepare(
      `SELECT r.id, r.customer_id, r.catalog_item_id, r.label, r.unit, r.unit_cents, r.quantity,
              r.interval_months, r.next_due, r.active, r.last_invoice_id, r.note, r.created_at, r.updated_at,
              c.name AS customer_name, c.email AS customer_email
         FROM recurring_services r
         JOIN customers c ON c.id = r.customer_id
         ${where}
        ORDER BY r.next_due ASC, r.id ASC`,
    )
    .bind(...binds)
    .all<RecurringListItem>();
  return (results ?? []).filter((row) => Boolean(asUnit(row.unit)));
}

export async function getRecurringService(db: D1Database, id: number): Promise<RecurringService | null> {
  const row = await db
    .prepare(`SELECT ${COLUMNS} FROM recurring_services WHERE id = ?`)
    .bind(id)
    .first<RecurringService>();
  return row && asUnit(row.unit) ? row : null;
}

export function advanceDueDate(nextDue: string, intervalMonths: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nextDue);
  if (!match) return nextDue;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month + Math.max(1, intervalMonths), day));
  return date.toISOString().slice(0, 10);
}

export async function saveRecurringService(
  db: D1Database,
  input: {
    id?: number;
    customerId: number;
    catalogItemId: number | null;
    label: string;
    unit: OfferUnit;
    unitCents: number;
    quantity: number;
    intervalMonths: number;
    nextDue: string;
    active: boolean;
    note: string | null;
  },
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  if (input.id && input.id > 0) {
    await db
      .prepare(
        `UPDATE recurring_services
            SET customer_id = ?, catalog_item_id = ?, label = ?, unit = ?, unit_cents = ?,
                quantity = ?, interval_months = ?, next_due = ?, active = ?, note = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(
        input.customerId,
        input.catalogItemId,
        input.label,
        input.unit,
        input.unitCents,
        input.quantity,
        input.intervalMonths,
        input.nextDue,
        input.active ? 1 : 0,
        input.note,
        now,
        input.id,
      )
      .run();
    return input.id;
  }
  const result = await db
    .prepare(
      `INSERT INTO recurring_services
         (customer_id, catalog_item_id, label, unit, unit_cents, quantity, interval_months, next_due, active, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.customerId,
      input.catalogItemId,
      input.label,
      input.unit,
      input.unitCents,
      input.quantity,
      input.intervalMonths,
      input.nextDue,
      input.active ? 1 : 0,
      input.note,
      now,
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function deleteRecurringService(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM recurring_services WHERE id = ?`).bind(id).run();
}

export async function markRecurringInvoiced(db: D1Database, id: number, invoiceId: number): Promise<void> {
  const row = await getRecurringService(db, id);
  if (!row) return;
  const next = advanceDueDate(row.next_due, row.interval_months);
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE recurring_services
          SET last_invoice_id = ?, next_due = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(invoiceId, next, now, id)
    .run();
}

export function recurringToLine(row: RecurringService): OfferLine {
  return {
    label: row.label,
    quantity: row.quantity,
    unit: row.unit,
    unitCents: row.unit_cents,
  };
}

export function recurringLineTotal(row: RecurringService): number {
  return lineTotalCents(recurringToLine(row));
}

export function isRecurringDue(row: RecurringService, today = berlinTodayIso()): boolean {
  return row.active === 1 && row.next_due <= today;
}

export async function parseRecurringForm(
  db: D1Database,
  form: FormData,
): Promise<{
  id?: number;
  customerId: number;
  catalogItemId: number | null;
  label: string;
  unit: OfferUnit;
  unitCents: number;
  quantity: number;
  intervalMonths: number;
  nextDue: string;
  active: boolean;
  note: string | null;
} | null> {
  const idRaw = Number.parseInt(String(form.get("id") ?? ""), 10);
  const customerId = Number.parseInt(String(form.get("customer_id") ?? ""), 10);
  const catalogId = Number.parseInt(String(form.get("catalog_item_id") ?? ""), 10);
  const intervalMonths = Number.parseInt(String(form.get("interval_months") ?? "1"), 10);
  const nextDue = String(form.get("next_due") ?? "").trim();
  const qtyRaw = String(form.get("quantity") ?? "1").trim().replace(",", ".");
  const note = String(form.get("note") ?? "").trim() || null;
  const active = String(form.get("active") ?? "") === "1";
  if (!Number.isFinite(customerId) || customerId <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) return null;
  if (![1, 3, 6, 12].includes(intervalMonths)) return null;
  const quantity = Number(qtyRaw);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10_000) return null;

  let label = String(form.get("label") ?? "").trim().replace(/\s+/g, " ");
  let unit: OfferUnit = "pauschal";
  let unitCents = 0;
  let catalogItemId: number | null = null;

  if (Number.isFinite(catalogId) && catalogId > 0) {
    const item = await getCatalogItem(db, catalogId);
    if (!item) return null;
    catalogItemId = item.id;
    label = label || item.label;
    unit = item.unit;
    unitCents = item.unit_cents;
  } else {
    const unitRaw = String(form.get("unit") ?? "").trim();
    const priceRaw = String(form.get("price") ?? "").trim().replace(/\s/g, "").replace(/€/g, "");
    if (label.length < 2 || label.length > 120) return null;
    if (!isOfferUnit(unitRaw)) return null;
    unit = unitRaw;
    if (priceRaw) {
      if (!/^\d{1,6}([.,]\d{1,2})?$/.test(priceRaw)) return null;
      unitCents = Math.round(Number(priceRaw.replace(",", ".")) * 100);
    }
  }
  if (label.length < 2) return null;

  return {
    id: Number.isFinite(idRaw) && idRaw > 0 ? idRaw : undefined,
    customerId,
    catalogItemId,
    label,
    unit,
    unitCents,
    quantity,
    intervalMonths,
    nextDue,
    active,
    note,
  };
}
