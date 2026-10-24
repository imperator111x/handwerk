-- Zeitpunkt der letzten Zahlungserinnerung (Unix-Sekunden).

ALTER TABLE invoices ADD COLUMN reminded_at INTEGER;
