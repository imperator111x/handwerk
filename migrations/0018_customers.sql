-- Kundenstamm. Angebote können an einen Kunden gehen, auch ohne Anfrage.
-- Bestehende Anfragen werden je E-Mail einmal als Kunde übernommen.

CREATE TABLE IF NOT EXISTS customers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  email        TEXT    NOT NULL,
  phone        TEXT,
  street       TEXT,
  postal_code  TEXT,
  city         TEXT,
  notes        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

INSERT INTO customers (name, email, phone, created_at)
SELECT c.name, c.email, NULLIF(trim(c.phone), ''), c.created_at
FROM contact_requests c
INNER JOIN (
  SELECT MAX(id) AS id
  FROM contact_requests
  WHERE trim(email) != ''
  GROUP BY lower(trim(email))
) latest ON latest.id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM customers cu WHERE lower(trim(cu.email)) = lower(trim(c.email))
);

CREATE TABLE quotes_v2 (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id   INTEGER REFERENCES contact_requests(id) ON DELETE SET NULL,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  price_cents  INTEGER NOT NULL,
  valid_until  TEXT    NOT NULL,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  sent_at      INTEGER,
  email_status TEXT,
  lines_json   TEXT    NOT NULL DEFAULT '[]'
);

INSERT INTO quotes_v2 (
  id, request_id, customer_id, title, body, price_cents, valid_until,
  created_at, sent_at, email_status, lines_json
)
SELECT
  q.id,
  q.request_id,
  (
    SELECT cu.id
    FROM customers cu
    JOIN contact_requests c ON c.id = q.request_id
    WHERE lower(trim(cu.email)) = lower(trim(c.email))
    ORDER BY cu.id DESC
    LIMIT 1
  ),
  q.title,
  q.body,
  q.price_cents,
  q.valid_until,
  q.created_at,
  q.sent_at,
  q.email_status,
  COALESCE(q.lines_json, '[]')
FROM quotes q;

DROP TABLE quotes;
ALTER TABLE quotes_v2 RENAME TO quotes;

CREATE INDEX IF NOT EXISTS idx_quotes_request ON quotes(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id, created_at DESC);

INSERT INTO sqlite_sequence (name, seq)
SELECT 'quotes', COALESCE(MAX(id), 0) FROM quotes
WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'quotes');

UPDATE sqlite_sequence
SET seq = COALESCE((SELECT MAX(id) FROM quotes), 0)
WHERE name = 'quotes';

DELETE FROM sqlite_sequence WHERE name = 'quotes_v2';
