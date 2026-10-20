-- Jedes Face-ID-Gerät hat einen Namen und den letzten Login.
ALTER TABLE passkeys ADD COLUMN label TEXT NOT NULL DEFAULT '';
ALTER TABLE passkeys ADD COLUMN last_used_at INTEGER;
