-- Angebot → Auftrag → abgerechnet.

ALTER TABLE quotes ADD COLUMN status TEXT NOT NULL DEFAULT 'offen'
  CHECK (status IN ('offen', 'angenommen', 'abgerechnet'));

CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status, created_at DESC);
