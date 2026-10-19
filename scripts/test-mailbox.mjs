import assert from "node:assert/strict";
import {
  cleanLocalPart,
  cleanRecipient,
  localPartFromName,
  matchMailboxLocalPart,
} from "../src/lib/mailbox.ts";

assert.equal(cleanLocalPart("Info"), "info");
assert.equal(cleanLocalPart("leon.luetcke"), "leon.luetcke");
assert.equal(cleanLocalPart("vor.nachname"), "vor.nachname");
assert.equal(cleanLocalPart("website"), null);
assert.equal(cleanLocalPart("r+3.abcdef"), null);
assert.equal(cleanLocalPart("a"), null);
assert.equal(cleanLocalPart("name..name"), null);
assert.equal(localPartFromName("Leon", "Lütcke"), "leon.luetcke");
assert.equal(cleanRecipient("Kunde@Example.com"), "kunde@example.com");
assert.equal(cleanRecipient("a@b.de, c@d.de"), null);
assert.equal(
  matchMailboxLocalPart(["r+3.abcd1234abcd1234@zeus-service.de", "Info <info@zeus-service.de>"]),
  "info",
);
assert.equal(matchMailboxLocalPart(["fremd@example.com"]), null);

console.log("mailbox checks ok");
