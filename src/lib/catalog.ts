import { isOfferUnit, type OfferUnit } from "./quote";

export interface CatalogItem {
  id: number;
  label: string;
  unit: OfferUnit;
  unit_cents: number;
  sort_order: number;
  active: number;
  created_at: number;
  updated_at: number | null;
}

const COLUMNS = `id, label, unit, unit_cents, sort_order, active, created_at, updated_at`;

export async function listCatalogItems(db: D1Database, activeOnly = false): Promise<CatalogItem[]> {
  const where = activeOnly ? "WHERE active = 1" : "";
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM catalog_items ${where} ORDER BY sort_order ASC, label ASC, id ASC`)
    .all<CatalogItem>();
  return (results ?? []).filter((row) => isOfferUnit(row.unit));
}

export async function getCatalogItem(db: D1Database, id: number): Promise<CatalogItem | null> {
  const row = await db.prepare(`SELECT ${COLUMNS} FROM catalog_items WHERE id = ?`).bind(id).first<CatalogItem>();
  if (!row || !isOfferUnit(row.unit)) return null;
  return row;
}

export async function saveCatalogItem(
  db: D1Database,
  input: { id?: number; label: string; unit: OfferUnit; unitCents: number; sortOrder: number; active: boolean },
): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  if (input.id && input.id > 0) {
    await db
      .prepare(
        `UPDATE catalog_items
            SET label = ?, unit = ?, unit_cents = ?, sort_order = ?, active = ?, updated_at = ?
          WHERE id = ?`,
      )
      .bind(input.label, input.unit, input.unitCents, input.sortOrder, input.active ? 1 : 0, now, input.id)
      .run();
    return input.id;
  }
  const result = await db
    .prepare(
      `INSERT INTO catalog_items (label, unit, unit_cents, sort_order, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(input.label, input.unit, input.unitCents, input.sortOrder, input.active ? 1 : 0, now)
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function deleteCatalogItem(db: D1Database, id: number): Promise<void> {
  await db.prepare(`DELETE FROM catalog_items WHERE id = ?`).bind(id).run();
}

export function parseCatalogForm(form: FormData): {
  id?: number;
  label: string;
  unit: OfferUnit;
  unitCents: number;
  sortOrder: number;
  active: boolean;
} | null {
  const idRaw = Number.parseInt(String(form.get("id") ?? ""), 10);
  const label = String(form.get("label") ?? "").trim().replace(/\s+/g, " ");
  const unitRaw = String(form.get("unit") ?? "").trim();
  const priceRaw = String(form.get("price") ?? "").trim();
  const sortRaw = Number.parseInt(String(form.get("sort_order") ?? "0"), 10);
  const active = String(form.get("active") ?? "1") === "1";
  if (label.length < 2 || label.length > 120) return null;
  if (!isOfferUnit(unitRaw)) return null;
  const cleaned = priceRaw.replace(/\s/g, "").replace(/€/g, "");
  let unitCents = 0;
  if (cleaned) {
    if (!/^\d{1,6}([.,]\d{1,2})?$/.test(cleaned)) return null;
    unitCents = Math.round(Number(cleaned.replace(",", ".")) * 100);
    if (!Number.isInteger(unitCents) || unitCents < 0 || unitCents > 10_000_000) return null;
  }
  return {
    id: Number.isFinite(idRaw) && idRaw > 0 ? idRaw : undefined,
    label,
    unit: unitRaw,
    unitCents,
    sortOrder: Number.isFinite(sortRaw) ? sortRaw : 0,
    active,
  };
}

export function catalogEuroField(cents: number): string {
  if (cents <= 0) return "";
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export function catalogPickerPayload(items: CatalogItem[]): Array<{
  label: string;
  unit: OfferUnit;
  price: string;
  qty: string;
}> {
  return items.map((item) => ({
    label: item.label,
    unit: item.unit,
    price: catalogEuroField(item.unit_cents),
    qty: item.unit === "pauschal" || item.unit === "stueck" ? "1" : "",
  }));
}
