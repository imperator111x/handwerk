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

const quote = await import("../src/lib/quote.ts");
const { buildOfferPdf } = await import("../src/lib/offer-pdf.ts");

assert.equal(quote.lineTotalCents({ label: "Stundenlohn", quantity: 2.5, unit: "stunde", unitCents: 4500 }), 11250);
assert.equal(quote.lineTotalCents({ label: "Preis pro km", quantity: 12, unit: "km", unitCents: 70 }), 840);
assert.equal(
  quote.offerTotalCents([
    { label: "Stundenlohn", quantity: 2.5, unit: "stunde", unitCents: 4500 },
    { label: "Preis pro km", quantity: 12, unit: "km", unitCents: 70 },
  ]),
  12090,
);

const form = new FormData();
form.set("title", "Rollladen einstellen");
form.set("intro", "Der Rollladen klemmt.");
form.set("valid_until", "2026-11-03");
form.append("line_label", "Stundenlohn");
form.append("line_qty", "2,5");
form.append("line_unit", "stunde");
form.append("line_price", "45,00");
form.append("line_label", "Preis pro km");
form.append("line_qty", "");
form.append("line_unit", "km");
form.append("line_price", "");
const parsed = quote.parseOfferForm(form, "2026-10-20");
assert.ok(parsed);
assert.equal(parsed.lines.length, 1);
assert.equal(parsed.priceCents, 11250);
assert.equal(quote.parseOfferForm(form, "2026-11-04"), null);

const stored = quote.readStoredOffer(
  JSON.stringify({
    greeting: "Guten Tag Frau Muster,",
    intro: "für die Arbeit.",
    lines: [{ label: "Anfahrt", quantity: 1, unit: "pauschal", unitCents: 1500 }],
  }),
  "",
);
assert.equal(stored.lines[0].label, "Anfahrt");
assert.equal(quote.readStoredOffer("[]", "alt").lines.length, 0);
assert.equal(quote.offerNumber(7, Date.parse("2026-10-20T10:00:00Z") / 1000), "A-2026-0007");

const plain = quote.offerPlainText({
  number: "A-2026-0007",
  title: "Rollladen",
  intro: "",
  lines: parsed.lines,
  validUntil: "2026-11-03",
});
assert.match(plain, /Stundenlohn/);
assert.match(plain, /Zahlbar innerhalb von 14 Tagen nach Ausführung/);
assert.match(plain, /112,50/);

const pdf = buildOfferPdf({
  number: "A-2026-0007",
  dateLabel: "20. Oktober 2026",
  customerName: "Erika Muster",
  customerEmail: "erika@example.com",
  customerPhone: "+49 155 000",
  title: "Rollladen einstellen",
  greeting: "Guten Tag Frau Muster,",
  intro: "für die besprochene Leistung bieten wir Ihnen folgende Positionen zum Festpreis an.",
  lines: [
    { label: "Stundenlohn", quantity: 2.5, unit: "stunde", unitCents: 4500 },
    { label: "Preis pro km", quantity: 12, unit: "km", unitCents: 70 },
  ],
  validUntilLabel: "3. November 2026",
  authorName: "Leon Lütcke",
});
const raw = new TextDecoder("latin1").decode(pdf);
const text = raw.replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(Number.parseInt(oct, 8)));
assert.match(raw, /^%PDF-1.4/);
assert.match(raw, /\/Subtype \/Image/);
assert.match(raw, /\/Im1 Do/);
assert.match(text, /Angebot/);
assert.match(text, /A-2026-0007/);
assert.match(text, /Erika Muster/);
assert.match(text, /Stundenlohn/);
assert.match(text, /Preis pro km/);
assert.match(text, /2,5/);
assert.match(text, /112,50 EUR/);
assert.match(text, /8,40 EUR/);
assert.match(text, /120,90 EUR/);
assert.match(text, /Zahlbar innerhalb von 14 Tagen nach Ausführung/);
assert.match(text, /Leon Lütcke/);
const start = Number(raw.match(/startxref\n(\d+)/)?.[1]);
assert.equal(raw.slice(start, start + 4), "xref");
const offsets = [...raw.matchAll(/(\d{10}) 00000 n/g)].map((match) => Number(match[1]));
for (const offset of offsets) {
  assert.match(raw.slice(offset, offset + 20), /^\d+ 0 obj/);
}

console.log("offer checks ok");
