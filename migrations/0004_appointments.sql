-- Termine: freie Slots, Einladungslinks und Buchungen an einer Anfrage.

CREATE TABLE IF NOT EXISTS appointment_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  starts_at  INTEGER NOT NULL,
  ends_at    INTEGER NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_appointment_slots_start
  ON appointment_slots(starts_at);

CREATE TABLE IF NOT EXISTS appointment_invites (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id    INTEGER NOT NULL,
  token         TEXT    NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  email_sent_at INTEGER,
  email_status  TEXT
);

CREATE INDEX IF NOT EXISTS idx_appointment_invites_request
  ON appointment_invites(request_id, id DESC);

CREATE TABLE IF NOT EXISTS appointment_bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL UNIQUE,
  slot_id     INTEGER NOT NULL UNIQUE,
  invite_id   INTEGER,
  first_name  TEXT    NOT NULL,
  last_name   TEXT    NOT NULL,
  street      TEXT    NOT NULL,
  postal_code TEXT,
  city        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
