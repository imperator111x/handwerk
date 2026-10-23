import type { ContactRequestListItem } from "./db";
import type { InvoiceRow } from "./invoices";
import { listInvoicesForCustomer } from "./invoices";
import { isAuftrag, jobStatusForQuote } from "./jobs";
import type { QuoteRow } from "./offers";
import { listQuotesForCustomer } from "./offers";
import type { RecurringListItem } from "./recurring";
import { listRecurringServices } from "./recurring";
import type { TimesheetRow } from "./timesheets";
import { listTimesheets } from "./timesheets";

export interface CustomerMailThread {
  id: number;
  mailbox_id: number;
  subject: string;
  peer_email: string;
  updated_at: number;
  local_part: string;
}

export async function listTimesheetsForCustomer(
  db: D1Database,
  customerId: number,
): Promise<TimesheetRow[]> {
  const all = await listTimesheets(db);
  return all.filter((row) => row.customer_id === customerId);
}

export async function listRequestsForCustomer(
  db: D1Database,
  customerId: number,
): Promise<ContactRequestListItem[]> {
  if (!Number.isInteger(customerId) || customerId <= 0) return [];
  const { results } = await db
    .prepare(
      `SELECT c.*,
         (
           SELECT COUNT(*) FROM contact_replies r
           WHERE r.request_id = c.id AND r.direction = 'inbound'
         ) AS inbound_count,
         (
           SELECT r.direction FROM contact_replies r
           WHERE r.request_id = c.id
           ORDER BY r.created_at DESC, r.id DESC
           LIMIT 1
         ) AS last_reply_direction
       FROM contact_requests c
      WHERE c.customer_id = ?
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 200`,
    )
    .bind(customerId)
    .all<ContactRequestListItem>();
  return (results ?? []).map((row) => {
    const direction = row.last_reply_direction;
    return {
      ...row,
      inbound_count: Number(row.inbound_count ?? 0),
      last_reply_direction:
        direction === "inbound" || direction === "outbound" ? direction : null,
    };
  });
}

/** @deprecated Prefer listRequestsForCustomer – bleibt als Fallback für alte Zeilen ohne FK. */
export async function listRequestsForCustomerEmail(
  db: D1Database,
  email: string,
): Promise<ContactRequestListItem[]> {
  const needle = email.trim().toLowerCase();
  if (!needle) return [];
  const { results } = await db
    .prepare(
      `SELECT c.*,
         (
           SELECT COUNT(*) FROM contact_replies r
           WHERE r.request_id = c.id AND r.direction = 'inbound'
         ) AS inbound_count,
         (
           SELECT r.direction FROM contact_replies r
           WHERE r.request_id = c.id
           ORDER BY r.created_at DESC, r.id DESC
           LIMIT 1
         ) AS last_reply_direction
       FROM contact_requests c
      WHERE c.customer_id IS NULL
        AND lower(trim(c.email)) = ?
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 100`,
    )
    .bind(needle)
    .all<ContactRequestListItem>();
  return (results ?? []).map((row) => {
    const direction = row.last_reply_direction;
    return {
      ...row,
      inbound_count: Number(row.inbound_count ?? 0),
      last_reply_direction:
        direction === "inbound" || direction === "outbound" ? direction : null,
    };
  });
}

export async function listMailThreadsForCustomer(
  db: D1Database,
  customerId: number,
): Promise<CustomerMailThread[]> {
  if (!Number.isInteger(customerId) || customerId <= 0) return [];
  const { results } = await db
    .prepare(
      `SELECT t.id, t.mailbox_id, t.subject, t.peer_email, t.updated_at, m.local_part
         FROM mail_threads t
         JOIN mailboxes m ON m.id = t.mailbox_id
        WHERE t.customer_id = ?
        ORDER BY t.updated_at DESC
        LIMIT 50`,
    )
    .bind(customerId)
    .all<CustomerMailThread>();
  return results ?? [];
}

/** @deprecated Prefer listMailThreadsForCustomer – Fallback für Threads ohne FK. */
export async function listMailThreadsForEmail(
  db: D1Database,
  email: string,
): Promise<CustomerMailThread[]> {
  const needle = email.trim().toLowerCase();
  if (!needle) return [];
  const { results } = await db
    .prepare(
      `SELECT t.id, t.mailbox_id, t.subject, t.peer_email, t.updated_at, m.local_part
         FROM mail_threads t
         JOIN mailboxes m ON m.id = t.mailbox_id
        WHERE t.customer_id IS NULL
          AND lower(t.peer_email) = ?
        ORDER BY t.updated_at DESC
        LIMIT 50`,
    )
    .bind(needle)
    .all<CustomerMailThread>();
  return results ?? [];
}

function mergeById<T extends { id: number }>(primary: T[], extra: T[]): T[] {
  const byId = new Map<number, T>();
  for (const row of [...primary, ...extra]) byId.set(row.id, row);
  return [...byId.values()];
}

export async function loadCustomerDossier(
  db: D1Database,
  customerId: number,
  email: string,
): Promise<{
  quotes: QuoteRow[];
  auftraege: QuoteRow[];
  invoices: InvoiceRow[];
  timesheets: TimesheetRow[];
  requests: ContactRequestListItem[];
  mails: CustomerMailThread[];
  recurring: RecurringListItem[];
}> {
  const [quotes, invoices, timesheets, linkedRequests, orphanRequests, linkedMails, orphanMails, recurring] =
    await Promise.all([
      listQuotesForCustomer(db, customerId),
      listInvoicesForCustomer(db, customerId),
      listTimesheetsForCustomer(db, customerId),
      listRequestsForCustomer(db, customerId),
      listRequestsForCustomerEmail(db, email),
      listMailThreadsForCustomer(db, customerId),
      listMailThreadsForEmail(db, email),
      listRecurringServices(db, { customerId }),
    ]);
  const requests = mergeById(linkedRequests, orphanRequests).sort((a, b) => b.created_at - a.created_at);
  const mails = mergeById(linkedMails, orphanMails).sort((a, b) => b.updated_at - a.updated_at);
  const auftraege = quotes.filter((row) => isAuftrag(row.status));
  return { quotes, auftraege, invoices, timesheets, requests, mails, recurring };
}

export { jobStatusForQuote };
