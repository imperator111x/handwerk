import assert from "node:assert/strict";
import { safeVisitPath, visitSource } from "../src/lib/visits.ts";

assert.equal(visitSource("", ""), "Direkt");
assert.equal(visitSource("https://www.google.de/search?q=hausmeister", ""), "Google");
assert.equal(visitSource("https://zeus-service.de/impressum", ""), "Eigene Website");
assert.equal(visitSource("https://example.com/artikel", ""), "example.com");
assert.equal(visitSource("https://example.com/x", "newsletter"), "newsletter");
assert.equal(visitSource("https://evil.test", "bad tag"), "evil.test");
assert.equal(safeVisitPath("/"), "/");
assert.equal(safeVisitPath("/impressum"), "/impressum");
assert.equal(safeVisitPath("/admin"), null);
assert.equal(safeVisitPath("//evil"), null);
assert.equal(safeVisitPath("/kontakt?x=1"), null);

console.log("visit checks ok");
