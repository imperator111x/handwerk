-- Festpreis-Angebote, Fotos der Arbeiten, Mitteilungen und gelesene Mails.

CREATE TABLE IF NOT EXISTS quotes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   INTEGER NOT NULL REFERENCES contact_requests(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  price_cents  INTEGER NOT NULL,
  valid_until  TEXT    NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at      INTEGER,
  email_status TEXT
);

CREATE INDEX IF NOT EXISTS idx_quotes_request ON quotes(request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS work_photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  caption      TEXT    NOT NULL DEFAULT '',
  content_type TEXT    NOT NULL,
  image        BLOB    NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT    NOT NULL UNIQUE,
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE mail_messages ADD COLUMN seen_at INTEGER;

UPDATE mail_messages
   SET seen_at = created_at
 WHERE direction = 'inbound'
   AND seen_at IS NULL;
