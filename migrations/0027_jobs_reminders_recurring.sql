-- Auftragsfortschritt, Mahnstufen, wiederkehrende Leistungen.

ALTER TABLE quotes ADD COLUMN job_status TEXT NOT NULL DEFAULT 'offen'
  CHECK (job_status IN ('offen', 'in_arbeit', 'fertig', 'abgerechnet'));

UPDATE quotes SET job_status = 'offen' WHERE status = 'angenommen';
UPDATE quotes SET job_status = 'abgerechnet' WHERE status = 'abgerechnet';

CREATE INDEX IF NOT EXISTS idx_quotes_job_status ON quotes(job_status, created_at DESC);

ALTER TABLE invoices ADD COLUMN reminder_level INTEGER NOT NULL DEFAULT 0;

UPDATE invoices SET reminder_level = 1 WHERE reminded_at IS NOT NULL AND reminder_level = 0;

CREATE TABLE IF NOT EXISTS recurring_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  catalog_item_id INTEGER REFERENCES catalog_items(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_cents INTEGER NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  interval_months INTEGER NOT NULL DEFAULT 1,
  next_due TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_services(active, next_due);
CREATE INDEX IF NOT EXISTS idx_recurring_customer ON recurring_services(customer_id, active);
