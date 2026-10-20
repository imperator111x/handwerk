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

const { canOpenScan, verdictFromStats } = await import("../src/lib/virus-total.ts");
const { attachmentBytes, isPreviewImage, safeContentType, safeDownloadName } = await import("../src/lib/mail-files.ts");

assert.equal(canOpenScan("clean"), true);
assert.equal(canOpenScan("pending"), false);
assert.equal(canOpenScan("malicious"), false);
assert.equal(canOpenScan("error"), false);

assert.equal(verdictFromStats({ malicious: 1, suspicious: 0, harmless: 10 }, true), "malicious");
assert.equal(verdictFromStats({ malicious: 0, suspicious: 2, harmless: 10 }, true), "malicious");
assert.equal(verdictFromStats({ malicious: 0, suspicious: 0, harmless: 4, undetected: 1 }, true), "clean");
assert.equal(verdictFromStats({ malicious: 0, suspicious: 0, harmless: 0, undetected: 0 }, true), "pending");
assert.equal(verdictFromStats({ harmless: 3 }, false), "pending");
assert.equal(verdictFromStats(null, true), "pending");

assert.equal(safeDownloadName("../../rechnung.pdf"), "rechnung.pdf");
assert.equal(safeDownloadName("foto bild.jpg"), "foto bild.jpg");
assert.equal(safeDownloadName(""), "anhang");
assert.equal(safeDownloadName(".."), "anhang");
assert.equal(safeDownloadName("hello<script>.pdf"), "hello_script_.pdf");

assert.equal(safeContentType("image/jpeg; charset=binary"), "image/jpeg");
assert.equal(safeContentType("text/html"), "text/html");
assert.equal(safeContentType("not a type"), "application/octet-stream");
assert.equal(isPreviewImage("image/png"), true);
assert.equal(isPreviewImage("image/svg+xml"), false);
assert.equal(isPreviewImage("application/pdf"), false);

const png = attachmentBytes({ content: "aGVsbG8=", encoding: "base64", mimeType: "image/png" });
assert.equal(new TextDecoder().decode(png), "hello");
assert.equal(attachmentBytes({ content: "@@@@", encoding: "base64" }), null);
assert.equal(new TextDecoder().decode(attachmentBytes({ content: "hallo", encoding: "utf8" })), "hallo");

console.log("mail file checks ok");
