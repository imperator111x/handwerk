-- Zahlungsstatus neben der festgeschriebenen Rechnung.
-- Betrag, Positionen und Käufer bleiben unverändert.

ALTER TABLE invoices ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'offen';
ALTER TABLE invoices ADD COLUMN paid_at INTEGER;
ALTER TABLE invoices ADD COLUMN payment_method TEXT;
ALTER TABLE invoices ADD COLUMN payment_reference TEXT;
ALTER TABLE invoices ADD COLUMN payment_url TEXT;
ALTER TABLE invoices ADD COLUMN payment_link_id TEXT;
ALTER TABLE invoices ADD COLUMN payment_note TEXT;
