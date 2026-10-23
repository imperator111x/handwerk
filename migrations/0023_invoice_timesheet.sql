-- Rechnung kann auf einen Stundenzettel verweisen (PDF-Anhang beim Versand).

ALTER TABLE invoices ADD COLUMN timesheet_id INTEGER REFERENCES timesheets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_timesheet ON invoices(timesheet_id);
