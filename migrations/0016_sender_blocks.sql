-- Gesperrte Absender. Neue Mails und Anfragen mit dieser Adresse oder IP werden verworfen.

CREATE TABLE IF NOT EXISTS sender_blocks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL CHECK (kind IN ('email', 'ip')),
  value      TEXT    NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (kind, value)
);

CREATE INDEX IF NOT EXISTS idx_sender_blocks_kind ON sender_blocks(kind, value);
