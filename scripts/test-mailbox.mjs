import assert from "node:assert/strict";
import {
  canOpenMailbox,
  cleanLocalPart,
  cleanRecipient,
  localPartFromName,
  mailboxOwnerLabel,
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
assert.equal(canOpenMailbox({ role: "admin" }, { user_id: null }), true);
assert.equal(canOpenMailbox({ role: "editor", userId: 4 }, { user_id: 4 }), true);
assert.equal(canOpenMailbox({ role: "editor", userId: 4 }, { user_id: 2 }), false);
assert.equal(canOpenMailbox({ role: "editor", userId: 4 }, { user_id: null }), false);
assert.equal(
  mailboxOwnerLabel({ user_id: 1, owner_name: "Leon Lütcke", owner_username: "admin" }),
  "Leon Lütcke",
);
assert.equal(
  mailboxOwnerLabel({ user_id: null, owner_name: "", owner_username: "" }),
  "Nicht zugeordnet",
);

console.log("mailbox checks ok");
