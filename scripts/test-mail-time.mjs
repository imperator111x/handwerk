import assert from "node:assert/strict";
import { formatBerlin } from "../src/lib/time.ts";

// 20. Oktober 2026, 09:18 UTC ist in Deutschland 11:18 Uhr (Sommerzeit).
const shown = formatBerlin(1792487907);
assert.match(shown, /20/);
assert.match(shown, /10/);
assert.match(shown, /2026/);
assert.match(shown, /11:18/);
assert.equal(shown.includes("09:18"), false);

console.log("mail time checks ok", shown);
