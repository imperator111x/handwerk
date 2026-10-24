-- Kundenportal-Aufträge als Anfragen mit Quelle kennzeichnen

ALTER TABLE contact_requests ADD COLUMN source TEXT NOT NULL DEFAULT 'web';

CREATE INDEX IF NOT EXISTS idx_contact_requests_source ON contact_requests(source);
