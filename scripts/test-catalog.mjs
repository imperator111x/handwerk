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

const catalog = await import("../src/lib/catalog.ts");
const offers = await import("../src/lib/offers.ts");

assert.equal(offers.quoteStatus(null), "offen");
assert.equal(offers.quoteStatus("angenommen"), "angenommen");
assert.equal(offers.QUOTE_STATUS_LABELS.angenommen, "Auftrag");

const form = new FormData();
form.set("label", "Arbeitslohn");
form.set("unit", "stunde");
form.set("price", "45,00");
form.set("sort_order", "10");
form.set("active", "1");
const parsed = catalog.parseCatalogForm(form);
assert.ok(parsed);
assert.equal(parsed.label, "Arbeitslohn");
assert.equal(parsed.unit, "stunde");
assert.equal(parsed.unitCents, 4500);
assert.equal(catalog.catalogEuroField(4500), "45,00");
assert.equal(catalog.catalogEuroField(0), "");

const picker = catalog.catalogPickerPayload([
  {
    id: 1,
    label: "Anfahrt",
    unit: "pauschal",
    unit_cents: 1500,
    sort_order: 1,
    active: 1,
    created_at: 1,
    updated_at: null,
  },
]);
assert.equal(picker[0]?.qty, "1");
assert.equal(picker[0]?.price, "15,00");

console.log("catalog checks ok");
