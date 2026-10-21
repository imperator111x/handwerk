-- Stornorechnung und die Rechnung, die eine ältere aufhebt.
-- Die alte Zeile bleibt stehen.

ALTER TABLE invoices ADD COLUMN document_kind TEXT NOT NULL DEFAULT 'rechnung';
ALTER TABLE invoices ADD COLUMN related_invoice_id INTEGER;
