-- Festgeschriebene Rechnungen. Die Nummer entsteht aus Jahr und id und wird nicht wiederverwendet.
-- Käufer und Steuernummer stehen als Abschrift auf der Rechnung, damit spätere Änderungen
-- an Kunde oder Einstellungen die ausgestellte Rechnung nicht verändern.

CREATE TABLE IF NOT EXISTS business_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tax_number TEXT NOT NULL DEFAULT ''
);

INSERT INTO business_profile (id, tax_number)
SELECT 1, ''
WHERE NOT EXISTS (SELECT 1 FROM business_profile WHERE id = 1);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  lines_json TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  invoice_date TEXT NOT NULL,
  service_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  tax_number TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  buyer_street TEXT NOT NULL,
  buyer_postal_code TEXT NOT NULL,
  buyer_city TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  email_status TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC, id DESC);
