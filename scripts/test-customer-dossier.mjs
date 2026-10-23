import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.(?:ts|js|mjs|json)$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const dossier = await import("../src/lib/customer-dossier.ts");
assert.equal(typeof dossier.listRequestsForCustomer, "function");
assert.equal(typeof dossier.listMailThreadsForCustomer, "function");
assert.equal(typeof dossier.loadCustomerDossier, "function");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(root, "migrations/0031_request_mail_customer.sql"), "utf8");
assert.match(migration, /ALTER TABLE contact_requests/);
assert.match(migration, /ADD COLUMN customer_id/);
assert.match(migration, /ALTER TABLE mail_threads/);
assert.match(migration, /UPDATE contact_requests/);
assert.match(migration, /UPDATE mail_threads/);

const customersSrc = readFileSync(join(root, "src/lib/customers.ts"), "utf8");
assert.match(customersSrc, /UPDATE contact_requests SET customer_id/);
assert.match(customersSrc, /UPDATE mail_threads SET customer_id/);

const dbSrc = readFileSync(join(root, "src/lib/db.ts"), "utf8");
assert.match(dbSrc, /customer_id\)\s*\n\s*VALUES/);
assert.match(dbSrc, /linkContactRequestCustomer/);
assert.match(dbSrc, /linkMailThreadCustomer/);
assert.match(dbSrc, /COALESCE\(excluded\.customer_id, mail_threads\.customer_id\)/);

console.log("customer-dossier checks ok");
