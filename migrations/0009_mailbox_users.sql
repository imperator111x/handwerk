-- Jedes Postfach kann einem Benutzer gehören.
ALTER TABLE mailboxes ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mailboxes_user ON mailboxes(user_id);
