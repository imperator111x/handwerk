-- Kundenantworten, die per E-Mail auf eine Admin-Antwort eingehen.
-- direction: outbound = Panel an Kunde, inbound = Kunde an Panel.
ALTER TABLE contact_replies ADD COLUMN direction TEXT NOT NULL DEFAULT 'outbound';
ALTER TABLE contact_replies ADD COLUMN from_email TEXT;
ALTER TABLE contact_replies ADD COLUMN message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_replies_message_id
  ON contact_replies(message_id);
