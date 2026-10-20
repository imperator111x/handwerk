-- Positionen eines Festpreis-Angebots (Menge, Einheit, Einzelpreis).

ALTER TABLE quotes ADD COLUMN lines_json TEXT NOT NULL DEFAULT '[]';
