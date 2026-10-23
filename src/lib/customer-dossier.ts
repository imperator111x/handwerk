import type { ContactRequestListItem } from "./db";
import { listContactRequests } from "./db";
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

export async function listRequestsForCustomerEmail(
  db: D1Database,
  email: string,
): Promise<ContactRequestListItem[]> {
  const needle = email.trim().toLowerCase();
  if (!needle) return [];
  const all = await listContactRequests(db, { status: "all", limit: 200 });
  return all.filter((row) => (row.email ?? "").trim().toLowerCase() === needle);
}

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
        WHERE lower(t.peer_email) = ?
        ORDER BY t.updated_at DESC
        LIMIT 50`,
    )
    .bind(needle)
    .all<CustomerMailThread>();
  return results ?? [];
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
  const [quotes, invoices, timesheets, requests, mails, recurring] = await Promise.all([
    listQuotesForCustomer(db, customerId),
    listInvoicesForCustomer(db, customerId),
    listTimesheetsForCustomer(db, customerId),
    listRequestsForCustomerEmail(db, email),
    listMailThreadsForEmail(db, email),
    listRecurringServices(db, { customerId }),
  ]);
  const auftraege = quotes.filter((row) => isAuftrag(row.status));
  return { quotes, auftraege, invoices, timesheets, requests, mails, recurring };
}

export { jobStatusForQuote };
