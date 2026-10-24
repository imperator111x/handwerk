-- Face-ID-Anmeldung für das Admin-Panel (WebAuthn-Passkeys).
CREATE TABLE IF NOT EXISTS passkeys (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT    NOT NULL UNIQUE,
  public_key    TEXT    NOT NULL,
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkeys(user_id);
