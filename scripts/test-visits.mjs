import assert from "node:assert/strict";
import { deviceLabel, safeVisitPath, visitSource } from "../src/lib/visits.ts";

assert.equal(visitSource("", ""), "Direkt");
assert.equal(visitSource("https://www.google.de/search?q=hausmeister", ""), "Google");
assert.equal(visitSource("https://zeus-service.de/impressum", ""), "Direkt");
assert.equal(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"), "iPhone · Safari");
assert.equal(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"), "Windows-PC · Chrome");
assert.equal(visitSource("https://example.com/artikel", ""), "example.com");
assert.equal(visitSource("https://example.com/x", "newsletter"), "newsletter");
assert.equal(visitSource("https://evil.test", "bad tag"), "evil.test");
assert.equal(safeVisitPath("/"), "/");
assert.equal(safeVisitPath("/impressum"), "/impressum");
assert.equal(safeVisitPath("/admin"), null);
assert.equal(safeVisitPath("//evil"), null);
assert.equal(safeVisitPath("/kontakt?x=1"), null);

console.log("visit checks ok");
