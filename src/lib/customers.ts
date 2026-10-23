const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CustomerRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number | null;
  default_due_days: number;
  site_name: string | null;
  site_street: string | null;
  site_postal_code: string | null;
  site_city: string | null;
}

export interface CustomerListItem extends CustomerRow {
  offer_count: number;
  sent_count: number;
}

export interface CustomerInput {
  name: string;
  email: string;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  notes: string | null;
  defaultDueDays: number;
  siteName: string | null;
  siteStreet: string | null;
  sitePostalCode: string | null;
  siteCity: string | null;
}

function clean(value: string, max: number): string | null {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, max);
}

export function parseCustomerForm(form: FormData): CustomerInput | null {
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(form.get("email") ?? "").trim();
  if (name.length < 2 || name.length > 120) return null;
  if (!EMAIL_RE.test(email) || email.length > 200) return null;
  const phone = clean(String(form.get("phone") ?? ""), 60);
  const street = clean(String(form.get("street") ?? ""), 120);
  const postalCode = clean(String(form.get("postal_code") ?? ""), 12);
  const city = clean(String(form.get("city") ?? ""), 80);
  const notesRaw = String(form.get("notes") ?? "").trim();
  if (notesRaw.length > 2000) return null;
  const dueRaw = Number.parseInt(String(form.get("default_due_days") ?? "14"), 10);
  const defaultDueDays = Number.isFinite(dueRaw) && dueRaw >= 0 && dueRaw <= 90 ? dueRaw : 14;
  return {
    name,
    email,
    phone,
    street,
    postalCode,
    city,
    notes: notesRaw || null,
    defaultDueDays,
    siteName: clean(String(form.get("site_name") ?? ""), 120),
    siteStreet: clean(String(form.get("site_street") ?? ""), 120),
    sitePostalCode: clean(String(form.get("site_postal_code") ?? ""), 12),
    siteCity: clean(String(form.get("site_city") ?? ""), 80),
  };
}

export function customerAddress(customer: {
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
}): string {
  const place = [customer.postal_code, customer.city].filter(Boolean).join(" ");
  return [customer.street, place].filter(Boolean).join(", ");
}

export async function listCustomers(db: D1Database, query = ""): Promise<CustomerListItem[]> {
  const term = query.trim();
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.email, c.phone, c.street, c.postal_code, c.city, c.notes,
              c.created_at, c.updated_at, c.default_due_days, c.site_name, c.site_street, c.site_postal_code, c.site_city,
              (SELECT COUNT(*) FROM quotes q WHERE q.customer_id = c.id) AS offer_count,
              (SELECT COUNT(*) FROM quotes q WHERE q.customer_id = c.id AND q.sent_at IS NOT NULL) AS sent_count
         FROM customers c
        WHERE ? = ''
           OR c.name LIKE ? COLLATE NOCASE
           OR c.email LIKE ? COLLATE NOCASE
           OR IFNULL(c.phone, '') LIKE ? COLLATE NOCASE
           OR IFNULL(c.city, '') LIKE ? COLLATE NOCASE
        ORDER BY c.name COLLATE NOCASE, c.id DESC`,
    )
    .bind(term, like, like, like, like)
    .all<CustomerListItem>();
  return results ?? [];
}

export async function getCustomer(db: D1Database, id: number): Promise<CustomerRow | null> {
  return await db
    .prepare(
      `SELECT id, name, email, phone, street, postal_code, city, notes, created_at, updated_at,
              default_due_days, site_name, site_street, site_postal_code, site_city
         FROM customers WHERE id = ?`,
    )
    .bind(id)
    .first<CustomerRow>();
}

export async function findCustomerByEmail(db: D1Database, email: string): Promise<CustomerRow | null> {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  return await db
    .prepare(
      `SELECT id, name, email, phone, street, postal_code, city, notes, created_at, updated_at,
              default_due_days, site_name, site_street, site_postal_code, site_city
         FROM customers
        WHERE lower(trim(email)) = ?
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(key)
    .first<CustomerRow>();
}

export async function createCustomer(db: D1Database, input: CustomerInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO customers (
         name, email, phone, street, postal_code, city, notes,
         default_due_days, site_name, site_street, site_postal_code, site_city
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.name,
      input.email,
      input.phone,
      input.street,
      input.postalCode,
      input.city,
      input.notes,
      input.defaultDueDays,
      input.siteName,
      input.siteStreet,
      input.sitePostalCode,
      input.siteCity,
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function updateCustomer(db: D1Database, id: number, input: CustomerInput): Promise<void> {
  await db
    .prepare(
      `UPDATE customers
          SET name = ?, email = ?, phone = ?, street = ?, postal_code = ?, city = ?, notes = ?,
              default_due_days = ?, site_name = ?, site_street = ?, site_postal_code = ?, site_city = ?,
              updated_at = unixepoch()
        WHERE id = ?`,
    )
    .bind(
      input.name,
      input.email,
      input.phone,
      input.street,
      input.postalCode,
      input.city,
      input.notes,
      input.defaultDueDays,
      input.siteName,
      input.siteStreet,
      input.sitePostalCode,
      input.siteCity,
      id,
    )
    .run();
}

export async function deleteCustomer(db: D1Database, id: number): Promise<void> {
  await db.batch([
    db.prepare(`DELETE FROM quotes WHERE customer_id = ?`).bind(id),
    db.prepare(`DELETE FROM customers WHERE id = ?`).bind(id),
  ]);
}

export async function ensureCustomer(db: D1Database, input: { name: string; email: string; phone?: string | null }): Promise<number> {
  const existing = await findCustomerByEmail(db, input.email);
  if (existing) return existing.id;
  const name = input.name.trim().replace(/\s+/g, " ") || input.email.trim();
  return await createCustomer(db, {
    name: name.slice(0, 120),
    email: input.email.trim(),
    phone: input.phone?.trim() ? input.phone.trim().slice(0, 60) : null,
    street: null,
    postalCode: null,
    city: null,
    notes: null,
    defaultDueDays: 14,
    siteName: null,
    siteStreet: null,
    sitePostalCode: null,
    siteCity: null,
  });
}

export function normalizeCustomerPhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

export function normalizeCustomerStreet(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/straße/g, "strasse")
    .replace(/str\./g, "strasse")
    .replace(/\bstr\b/g, "strasse");
}

export type DuplicateReason = "email" | "phone" | "address";

export type CustomerMatchFields = Pick<CustomerRow, "email" | "phone" | "street" | "postal_code" | "city">;

export interface CustomerDuplicate extends CustomerRow {
  reasons: DuplicateReason[];
}

/** Gründe, warum zwei Kunden als Dublette gelten (E-Mail, Telefon-Suffix, Adresse). */
export function customerDuplicateReasons(a: CustomerMatchFields, b: CustomerMatchFields): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  const emailA = a.email.trim().toLowerCase();
  const emailB = b.email.trim().toLowerCase();
  if (emailA && emailA === emailB) reasons.push("email");

  const phoneA = normalizeCustomerPhone(a.phone);
  const phoneB = normalizeCustomerPhone(b.phone);
  if (
    phoneA.length >= 6 &&
    phoneB.length >= 6 &&
    (phoneB.endsWith(phoneA.slice(-8)) || phoneA.endsWith(phoneB.slice(-8)))
  ) {
    reasons.push("phone");
  }

  const streetA = normalizeCustomerStreet(a.street);
  const streetB = normalizeCustomerStreet(b.street);
  const postalA = (a.postal_code ?? "").trim().toLowerCase();
  const postalB = (b.postal_code ?? "").trim().toLowerCase();
  const cityA = (a.city ?? "").trim().toLowerCase();
  const cityB = (b.city ?? "").trim().toLowerCase();
  if (streetA && postalA && cityA && streetA === streetB && postalA === postalB && cityA === cityB) {
    reasons.push("address");
  }
  return reasons;
}

/** Mögliche Dubletten: gleiche E-Mail, gleiches Telefon oder gleiche Adresse. */
export async function findCustomerDuplicates(db: D1Database, customer: CustomerRow): Promise<CustomerDuplicate[]> {
  const email = customer.email.trim().toLowerCase();
  const phone = normalizeCustomerPhone(customer.phone);
  const postal = (customer.postal_code ?? "").trim().toLowerCase();

  const { results } = await db
    .prepare(
      `SELECT id, name, email, phone, street, postal_code, city, notes, created_at, updated_at,
              default_due_days, site_name, site_street, site_postal_code, site_city
         FROM customers
        WHERE id != ?
          AND (
            lower(trim(email)) = ?
            OR (? != '' AND lower(trim(IFNULL(postal_code, ''))) = ?)
          )
        ORDER BY id ASC
        LIMIT 100`,
    )
    .bind(customer.id, email, postal, postal)
    .all<CustomerRow>();

  // Telefon zusätzlich grob über Suffix suchen (Formatierung in der DB ist uneinheitlich).
  let phoneRows: CustomerRow[] = [];
  if (phone.length >= 6) {
    const suffix = phone.slice(-8);
    const phoneHit = await db
      .prepare(
        `SELECT id, name, email, phone, street, postal_code, city, notes, created_at, updated_at,
                default_due_days, site_name, site_street, site_postal_code, site_city
           FROM customers
          WHERE id != ?
            AND IFNULL(phone, '') != ''
          ORDER BY id ASC
          LIMIT 200`,
      )
      .bind(customer.id)
      .all<CustomerRow>();
    phoneRows = (phoneHit.results ?? []).filter((row) => {
      const other = normalizeCustomerPhone(row.phone);
      return other.length >= 6 && (other.endsWith(suffix) || phone.endsWith(other.slice(-8)));
    });
  }

  const byId = new Map<number, CustomerRow>();
  for (const row of [...(results ?? []), ...phoneRows]) byId.set(row.id, row);

  const matches: CustomerDuplicate[] = [];
  for (const row of byId.values()) {
    const reasons = customerDuplicateReasons(customer, row);
    if (reasons.length) matches.push({ ...row, reasons });
  }
  return matches.sort((a, b) => a.id - b.id);
}

function pickText(survivor: string | null, loser: string | null): string | null {
  const a = survivor?.trim() || null;
  const b = loser?.trim() || null;
  return a || b;
}

function coalesceCustomer(survivor: CustomerRow, loser: CustomerRow): CustomerInput {
  const notes = [survivor.notes?.trim(), loser.notes?.trim(), loser.email.trim().toLowerCase() !== survivor.email.trim().toLowerCase()
    ? `Zusammengeführt mit ${loser.name} (${loser.email}).`
    : null]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);
  return {
    name: survivor.name.trim() || loser.name.trim(),
    email: survivor.email.trim(),
    phone: pickText(survivor.phone, loser.phone),
    street: pickText(survivor.street, loser.street),
    postalCode: pickText(survivor.postal_code, loser.postal_code),
    city: pickText(survivor.city, loser.city),
    notes: notes || null,
    defaultDueDays:
      survivor.default_due_days === 14 && loser.default_due_days !== 14
        ? loser.default_due_days
        : survivor.default_due_days,
    siteName: pickText(survivor.site_name, loser.site_name),
    siteStreet: pickText(survivor.site_street, loser.site_street),
    sitePostalCode: pickText(survivor.site_postal_code, loser.site_postal_code),
    siteCity: pickText(survivor.site_city, loser.site_city),
  };
}

export type MergeCustomersResult =
  | { ok: true; survivorId: number; loserId: number }
  | { ok: false; code: "missing" | "same" | "portal" };

/** Verschiebt alle Verknüpfungen von loser → survivor und löscht den Dubletten-Kunden. */
export async function mergeCustomers(
  db: D1Database,
  survivorId: number,
  loserId: number,
): Promise<MergeCustomersResult> {
  if (!Number.isFinite(survivorId) || !Number.isFinite(loserId) || survivorId <= 0 || loserId <= 0) {
    return { ok: false, code: "missing" };
  }
  if (survivorId === loserId) return { ok: false, code: "same" };
  const survivor = await getCustomer(db, survivorId);
  const loser = await getCustomer(db, loserId);
  if (!survivor || !loser) return { ok: false, code: "missing" };

  const portalBoth = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM portal_accounts WHERE customer_id = ?) AS survivor_accounts,
         (SELECT COUNT(*) FROM portal_accounts WHERE customer_id = ?) AS loser_accounts`,
    )
    .bind(survivorId, loserId)
    .first<{ survivor_accounts: number; loser_accounts: number }>();
  if (Number(portalBoth?.survivor_accounts ?? 0) > 0 && Number(portalBoth?.loser_accounts ?? 0) > 0) {
    return { ok: false, code: "portal" };
  }

  const merged = coalesceCustomer(survivor, loser);
  await db.batch([
    db.prepare(`UPDATE quotes SET customer_id = ? WHERE customer_id = ?`).bind(survivorId, loserId),
    db.prepare(`UPDATE invoices SET customer_id = ? WHERE customer_id = ?`).bind(survivorId, loserId),
    db.prepare(`UPDATE recurring_services SET customer_id = ? WHERE customer_id = ?`).bind(survivorId, loserId),
    db.prepare(`UPDATE timesheets SET customer_id = ? WHERE customer_id = ?`).bind(survivorId, loserId),
    db.prepare(`UPDATE portal_invites SET customer_id = ? WHERE customer_id = ?`).bind(survivorId, loserId),
    db.prepare(`UPDATE portal_accounts SET customer_id = ? WHERE customer_id = ?`).bind(survivorId, loserId),
    db
      .prepare(
        `UPDATE customers
            SET name = ?, email = ?, phone = ?, street = ?, postal_code = ?, city = ?, notes = ?,
                default_due_days = ?, site_name = ?, site_street = ?, site_postal_code = ?, site_city = ?,
                updated_at = unixepoch()
          WHERE id = ?`,
      )
      .bind(
        merged.name,
        merged.email,
        merged.phone,
        merged.street,
        merged.postalCode,
        merged.city,
        merged.notes,
        merged.defaultDueDays,
        merged.siteName,
        merged.siteStreet,
        merged.sitePostalCode,
        merged.siteCity,
        survivorId,
      ),
    db.prepare(`DELETE FROM customers WHERE id = ?`).bind(loserId),
  ]);
  return { ok: true, survivorId, loserId };
}
