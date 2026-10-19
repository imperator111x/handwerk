-- Initial schema for Zeus-Service admin panel.
--
-- Ausfuehren (nach `wrangler d1 create zeus-service-db`):
--   npx wrangler d1 execute zeus-service-db --remote --file=migrations/0001_init.sql
-- Fuer lokale Entwicklung (gegen eine lokale D1):
--   npx wrangler d1 execute zeus-service-db --local  --file=migrations/0001_init.sql

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'admin',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS contact_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER,
  name       TEXT    NOT NULL,
  email      TEXT    NOT NULL,
  phone      TEXT,
  topic      TEXT    NOT NULL,
  message    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'in_progress', 'done', 'archived')),
  notes      TEXT,
  ip         TEXT,
  country    TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_status
  ON contact_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_requests_created
  ON contact_requests(created_at DESC);
