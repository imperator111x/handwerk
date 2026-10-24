import assert from "node:assert/strict";
import { greetingChoices, greetingFor } from "../src/lib/salutation.ts";

assert.equal(greetingFor("herr", "Max Mustermann"), "Sehr geehrter Herr Mustermann,");
assert.equal(greetingFor("frau", "Erika Muster"), "Sehr geehrte Frau Muster,");
assert.equal(greetingFor("herren_damen", "Max Mustermann"), "Sehr geehrte Herren und Damen,");
assert.equal(greetingFor("herren_damen", ""), "Sehr geehrte Herren und Damen,");
assert.equal(greetingFor("hallo_vorname", "Max Mustermann"), "Hallo Max,");
assert.equal(greetingFor("hallo_name", "Max Mustermann"), "Hallo Max Mustermann,");
assert.equal(greetingFor("herr", "Mustermann"), "Sehr geehrter Herr Mustermann,");
assert.equal(greetingFor("hallo_vorname", ""), null);
assert.equal(greetingFor("herr", ""), "Sehr geehrter Herr,");
assert.equal(greetingFor("sonst", "Anna Berg"), "Hallo Anna Berg,");

const labels = greetingChoices("Max Mustermann").map((choice) => choice.label);
assert.deepEqual(labels, [
  "Sehr geehrter Herr Mustermann",
  "Sehr geehrte Frau Mustermann",
  "Sehr geehrte Herren und Damen",
  "Hallo Max",
  "Hallo Max Mustermann",
]);

console.log("salutation checks ok");
