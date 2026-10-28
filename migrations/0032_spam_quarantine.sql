-- Spam-Quarantäne (Status), Dedup für Doppel-Mails, gelernte Spam-Signale.

PRAGMA foreign_keys = OFF;

CREATE TABLE contact_requests_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER,
  name         TEXT    NOT NULL,
  email        TEXT    NOT NULL,
  phone        TEXT,
  topic        TEXT    NOT NULL,
  message      TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new', 'in_progress', 'done', 'archived', 'spam')),
  notes        TEXT,
  ip           TEXT,
  country      TEXT,
  user_agent   TEXT,
  source       TEXT    NOT NULL DEFAULT 'web',
  customer_id  INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  spam_reason  TEXT
);

INSERT INTO contact_requests_new (
  id, created_at, updated_at, name, email, phone, topic, message, status,
  notes, ip, country, user_agent, source, customer_id, spam_reason
)
SELECT
  id, created_at, updated_at, name, email, phone, topic, message, status,
  notes, ip, country, user_agent, COALESCE(source, 'web'), customer_id, NULL
FROM contact_requests;

DROP TABLE contact_requests;
ALTER TABLE contact_requests_new RENAME TO contact_requests;

CREATE INDEX IF NOT EXISTS idx_contact_requests_status
  ON contact_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_requests_created
  ON contact_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_requests_source
  ON contact_requests(source);
CREATE INDEX IF NOT EXISTS idx_contact_requests_customer
  ON contact_requests(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inbound_dedup (
  hash       TEXT    PRIMARY KEY,
  request_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_inbound_dedup_created
  ON inbound_dedup(created_at DESC);

CREATE TABLE IF NOT EXISTS spam_signals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT    NOT NULL CHECK (kind IN ('email', 'domain', 'phrase')),
  value      TEXT    NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (kind, value)
);

CREATE INDEX IF NOT EXISTS idx_spam_signals_kind
  ON spam_signals(kind, value);

PRAGMA foreign_keys = ON;
