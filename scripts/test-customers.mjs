import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.(?:ts|js|mjs|json)$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const customers = await import("../src/lib/customers.ts");

assert.equal(customers.normalizeCustomerPhone("+49 155 / 123-456"), "49155123456");
assert.equal(customers.normalizeCustomerPhone(null), "");
assert.equal(customers.normalizeCustomerStreet("Musterstr. 12"), "musterstrasse 12");
assert.equal(customers.normalizeCustomerStreet("Musterstraße 12"), "musterstrasse 12");
assert.equal(customers.normalizeCustomerStreet("  Haupt  Str  1 "), "haupt strasse 1");

const base = {
  email: "kunde@example.com",
  phone: "0155 1234567",
  street: "Musterstr. 1",
  postal_code: "10115",
  city: "Berlin",
};

assert.deepEqual(
  customers.customerDuplicateReasons(base, {
    email: "KUNDE@example.com",
    phone: null,
    street: null,
    postal_code: null,
    city: null,
  }),
  ["email"],
);

assert.deepEqual(
  customers.customerDuplicateReasons(base, {
    email: "other@example.com",
    phone: "+49 155 1234567",
    street: null,
    postal_code: null,
    city: null,
  }),
  ["phone"],
);

assert.deepEqual(
  customers.customerDuplicateReasons(base, {
    email: "other@example.com",
    phone: null,
    street: "Musterstraße 1",
    postal_code: "10115",
    city: "Berlin",
  }),
  ["address"],
);

assert.deepEqual(
  customers.customerDuplicateReasons(base, {
    email: "kunde@example.com",
    phone: "01551234567",
    street: "Musterstr. 1",
    postal_code: "10115",
    city: "Berlin",
  }),
  ["email", "phone", "address"],
);

assert.deepEqual(
  customers.customerDuplicateReasons(base, {
    email: "other@example.com",
    phone: "030 999",
    street: "Andere Straße 2",
    postal_code: "10115",
    city: "Berlin",
  }),
  [],
);

assert.deepEqual(
  customers.customerDuplicateReasons(
    { ...base, phone: "12" },
    { email: "other@example.com", phone: "12", street: null, postal_code: null, city: null },
  ),
  [],
);

console.log("customer checks ok");
