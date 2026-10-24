-- Zahlungsziel, Baustelle, Teilrechnung/Teilzahlung, Gutschrift-Felder

ALTER TABLE customers ADD COLUMN default_due_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE customers ADD COLUMN site_name TEXT;
ALTER TABLE customers ADD COLUMN site_street TEXT;
ALTER TABLE customers ADD COLUMN site_postal_code TEXT;
ALTER TABLE customers ADD COLUMN site_city TEXT;

ALTER TABLE invoices ADD COLUMN due_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE invoices ADD COLUMN payment_terms TEXT;
ALTER TABLE invoices ADD COLUMN site_name TEXT;
ALTER TABLE invoices ADD COLUMN site_street TEXT;
ALTER TABLE invoices ADD COLUMN site_postal_code TEXT;
ALTER TABLE invoices ADD COLUMN site_city TEXT;
ALTER TABLE invoices ADD COLUMN billing_kind TEXT NOT NULL DEFAULT 'voll';
ALTER TABLE invoices ADD COLUMN parent_invoice_id INTEGER;
ALTER TABLE invoices ADD COLUMN amount_paid_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  paid_at INTEGER NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_kind ON invoices(billing_kind);
CREATE INDEX IF NOT EXISTS idx_invoices_parent ON invoices(parent_invoice_id);
