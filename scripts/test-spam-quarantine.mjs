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

const dedup = await import("../src/lib/inbound-dedup.ts");

const keysA = await dedup.inboundDedupKeys({
  messageId: "<abc@example.com>",
  from: "a@b.de",
  subject: "Hallo",
  body: "Testnachricht",
});
const keysB = await dedup.inboundDedupKeys({
  messageId: "<abc@example.com>",
  from: "a@b.de",
  subject: "Hallo",
  body: "Testnachricht",
});
const keysC = await dedup.inboundDedupKeys({
  messageId: "<other@example.com>",
  from: "a@b.de",
  subject: "Hallo",
  body: "Andere Nachricht",
});

assert.deepEqual(keysA, keysB);
assert.notDeepEqual(keysA, keysC);
assert.ok(keysA.some((k) => k.startsWith("mid:")));
assert.ok(keysA.some((k) => k.startsWith("body:")));

console.log("spam-quarantine checks ok");
