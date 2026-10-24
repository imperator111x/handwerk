import assert from "node:assert/strict";
import { isOwnMailboxEmail, normalizeBlockEmail, normalizeBlockIp } from "../src/lib/blocks.ts";

assert.equal(normalizeBlockEmail("  Max@Beispiel.de "), "max@beispiel.de");
assert.equal(normalizeBlockEmail("kein-mail"), null);
assert.equal(normalizeBlockEmail(""), null);
assert.equal(normalizeBlockIp("203.0.113.8"), "203.0.113.8");
assert.equal(normalizeBlockIp("203.0.113.8, 10.0.0.1"), "203.0.113.8");
assert.equal(normalizeBlockIp("unknown"), null);
assert.equal(normalizeBlockIp("999.1.1.1"), null);
assert.equal(normalizeBlockIp("2001:DB8::1"), "2001:db8::1");
assert.equal(isOwnMailboxEmail("leon.luetcke@zeus-service.de"), true);
assert.equal(isOwnMailboxEmail("kunde@example.com"), false);

console.log("block checks ok");
