-- Antworten des Admins zu einer Anfrage (Thread-Verlauf).
-- Jede Antwort wird in der DB protokolliert und kann optional per
-- Resend-E-Mail an den Anfragenden geschickt worden sein.
CREATE TABLE IF NOT EXISTS contact_replies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id    INTEGER NOT NULL REFERENCES contact_requests(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name   TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  email_sent_at INTEGER,
  email_status  TEXT,
  email_error   TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_contact_replies_request
  ON contact_replies(request_id, created_at DESC);
