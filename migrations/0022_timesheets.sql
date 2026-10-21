-- Stundenzettel. Nach der Unterschrift bleibt der Inhalt festgeschrieben.

CREATE TABLE IF NOT EXISTS timesheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  street TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL,
  work_date TEXT NOT NULL,
  lines_json TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  total_minutes INTEGER NOT NULL,
  content_hash TEXT,
  signed_at INTEGER,
  signer_name TEXT NOT NULL DEFAULT '',
  signature_jpeg TEXT NOT NULL DEFAULT '',
  customer_signer_name TEXT NOT NULL DEFAULT '',
  customer_signature_jpeg TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  user_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_timesheets_date ON timesheets(work_date DESC, id DESC);
