-- Anfragen und Postfach-Threads fest an Kunden koppeln (nicht nur per E-Mail-String)

ALTER TABLE contact_requests
  ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contact_requests_customer
  ON contact_requests(customer_id, created_at DESC);

ALTER TABLE mail_threads
  ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mail_threads_customer
  ON mail_threads(customer_id, updated_at DESC);

-- Bestehende Zeilen per E-Mail nachziehen (wie ensureCustomer / 0018)
UPDATE contact_requests
   SET customer_id = (
     SELECT cu.id FROM customers cu
      WHERE lower(trim(cu.email)) = lower(trim(contact_requests.email))
      ORDER BY cu.id DESC
      LIMIT 1
   )
 WHERE customer_id IS NULL
   AND trim(IFNULL(email, '')) != '';

UPDATE mail_threads
   SET customer_id = (
     SELECT cu.id FROM customers cu
      WHERE lower(trim(cu.email)) = lower(trim(mail_threads.peer_email))
      ORDER BY cu.id DESC
      LIMIT 1
   )
 WHERE customer_id IS NULL
   AND trim(IFNULL(peer_email, '')) != '';
