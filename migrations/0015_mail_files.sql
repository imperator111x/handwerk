-- Anhänge eingehender Mails. Die Datei selbst liegt im KV, hier nur die Prüfung.

CREATE TABLE IF NOT EXISTS mail_files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mail_message_id INTEGER,
  reply_id        INTEGER,
  request_id      INTEGER,
  filename        TEXT    NOT NULL,
  content_type    TEXT    NOT NULL,
  size_bytes      INTEGER NOT NULL,
  sha256          TEXT    NOT NULL,
  storage_key     TEXT    NOT NULL UNIQUE,
  scan_status     TEXT    NOT NULL DEFAULT 'pending',
  vt_malicious    INTEGER NOT NULL DEFAULT 0,
  vt_suspicious   INTEGER NOT NULL DEFAULT 0,
  vt_harmless     INTEGER NOT NULL DEFAULT 0,
  vt_analysis_id  TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_mail_files_message ON mail_files(mail_message_id);
CREATE INDEX IF NOT EXISTS idx_mail_files_reply ON mail_files(reply_id);
CREATE INDEX IF NOT EXISTS idx_mail_files_request ON mail_files(request_id);
CREATE INDEX IF NOT EXISTS idx_mail_files_sha ON mail_files(sha256);
