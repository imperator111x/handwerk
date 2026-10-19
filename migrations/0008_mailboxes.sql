-- Eigene Postfächer wie info@ und vor.nachname@zeus-service.de.
-- Eingehende Post an diese Adressen bleibt im Admin, ausgehende Mails
-- gehen an beliebige Empfänger.

CREATE TABLE IF NOT EXISTS mailboxes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  local_part   TEXT    NOT NULL UNIQUE,
  display_name TEXT    NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS mail_threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mailbox_id  INTEGER NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  peer_email  TEXT    NOT NULL,
  peer_name   TEXT    NOT NULL DEFAULT '',
  subject     TEXT    NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (mailbox_id, peer_email)
);

CREATE TABLE IF NOT EXISTS mail_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id     INTEGER NOT NULL REFERENCES mail_threads(id) ON DELETE CASCADE,
  direction     TEXT    NOT NULL,
  from_email    TEXT    NOT NULL,
  to_email      TEXT    NOT NULL,
  subject       TEXT    NOT NULL,
  body          TEXT    NOT NULL,
  message_id    TEXT,
  email_sent_at INTEGER,
  email_status  TEXT,
  email_error   TEXT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name   TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_mail_threads_updated
  ON mail_threads(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mail_messages_thread
  ON mail_messages(thread_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_messages_message_id
  ON mail_messages(message_id)
  WHERE message_id IS NOT NULL;

INSERT INTO mailboxes (local_part, display_name)
SELECT 'info', 'Zeus-Service'
WHERE NOT EXISTS (SELECT 1 FROM mailboxes WHERE local_part = 'info');
