import assert from "node:assert/strict";
import {
  canDeleteMailbox,
  canOpenMailbox,
  cleanLocalPart,
  cleanRecipient,
  isExternalLocalPart,
  isExternalMailboxAddress,
  localPartFromName,
  mailboxOwnerLabel,
  matchMailboxLocalPart,
} from "../src/lib/mailbox.ts";

assert.equal(cleanLocalPart("Info"), null);
assert.equal(isExternalLocalPart("info"), true);
assert.equal(isExternalMailboxAddress("Info <info@zeus-service.de>"), true);
assert.equal(isExternalMailboxAddress("leon.luetcke@zeus-service.de"), false);
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
assert.equal(canOpenMailbox({ role: "admin" }, { memberIds: [] }), true);
assert.equal(canOpenMailbox({ role: "editor", userId: 4 }, { memberIds: [2, 4] }), true);
assert.equal(canOpenMailbox({ role: "editor", userId: 4 }, { memberIds: [2] }), false);
assert.equal(canOpenMailbox({ role: "editor", userId: 4 }, { memberIds: [] }), false);
assert.equal(canDeleteMailbox({ role: "admin" }, { local_part: "info", memberIds: [] }), false);
assert.equal(canDeleteMailbox({ role: "admin" }, { local_part: "leon.luetcke", memberIds: [] }), true);
assert.equal(
  canDeleteMailbox({ role: "editor", userId: 4 }, { local_part: "leon.luetcke", memberIds: [4] }),
  true,
);
assert.equal(
  canDeleteMailbox({ role: "editor", userId: 4 }, { local_part: "leon.luetcke", memberIds: [2] }),
  false,
);
assert.equal(
  mailboxOwnerLabel({ memberNames: "Leon Lütcke, Anna Beispiel" }),
  "Leon Lütcke, Anna Beispiel",
);
assert.equal(mailboxOwnerLabel({ memberNames: "  " }), "Nicht zugeordnet");

console.log("mailbox checks ok");
