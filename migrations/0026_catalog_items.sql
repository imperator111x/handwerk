-- Leistungskatalog für Angebot und Rechnung.

CREATE TABLE IF NOT EXISTS catalog_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_catalog_active ON catalog_items(active, sort_order, label);

INSERT INTO catalog_items (label, unit, unit_cents, sort_order) VALUES
  ('Arbeitslohn', 'stunde', 4500, 10),
  ('Anfahrt', 'pauschal', 1500, 20),
  ('Material', 'pauschal', 0, 30),
  ('Preis pro km', 'km', 0, 40);
