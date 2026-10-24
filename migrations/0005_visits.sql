-- Seitenaufrufe nach bestandenem Bot-Check und Zustimmung zur Statistik.
-- Gespeichert werden Pfad, Herkunft und Land, keine IP-Adresse.

CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  path TEXT NOT NULL,
  source TEXT NOT NULL,
  country TEXT
);

CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views (created_at);
