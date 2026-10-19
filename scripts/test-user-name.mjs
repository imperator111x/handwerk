import assert from "node:assert/strict";
import { cleanPersonName, formatUserSignature } from "../src/lib/user-name.ts";

assert.equal(cleanPersonName("  Leon  "), "Leon");
assert.equal(cleanPersonName("Lütcke"), "Lütcke");
assert.equal(cleanPersonName("Anne-Marie"), "Anne-Marie");
assert.equal(cleanPersonName(""), null);
assert.equal(cleanPersonName("Leon<script>"), null);
assert.equal(formatUserSignature("Leon", "Lütcke", "admin"), "Leon Lütcke");
assert.equal(formatUserSignature("", "", "admin"), "admin");
assert.equal(formatUserSignature("  ", null, "admin"), "admin");

console.log("user name checks ok");
