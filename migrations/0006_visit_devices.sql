-- Ein Gerät zählt pro Tag einmal. Die IP bleibt als Prüfwert, nicht als Adresse.

ALTER TABLE page_views ADD COLUMN device TEXT;
ALTER TABLE page_views ADD COLUMN visitor_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views (visitor_key);

UPDATE page_views SET source = 'Direkt' WHERE source = 'Eigene Website';
