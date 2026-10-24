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

const { htmlToPlainText, replaceEditorImages, sanitizeMailHtml } = await import("../src/lib/mail-html.ts");
const { imageNameParts, inspectUpload, safeFilename } = await import("../src/lib/mail-files.ts");

const dirty = `<p onclick="alert(1)">Hallo <strong>Team</strong></p><script>alert(1)</script><a href="javascript:alert(1)">böse</a><a href="https://zeus-service.de">Seite</a>`;
const clean = sanitizeMailHtml(dirty);
assert.match(clean, /<p>Hallo <strong>Team<\/strong><\/p>/);
assert.equal(clean.includes("script"), false);
assert.equal(clean.includes("onclick"), false);
assert.equal(clean.includes("javascript:"), false);
assert.match(clean, /href="https:\/\/zeus-service\.de"/);
assert.equal(sanitizeMailHtml('<img src="https://evil.test/a.png">'), "");
assert.match(sanitizeMailHtml('<img src="cid:img-abc123" alt="Foto">'), /src="cid:img-abc123"/);

const images = new Map([["imgabc", { cid: "img-imgabc", filename: "foto.png" }]]);
const replaced = replaceEditorImages('<p>Text</p><img data-upload-id="imgabc" src="blob:local">', images, "email");
assert.match(replaced, /src="cid:img-imgabc"/);
assert.match(
  replaceEditorImages('<img data-upload-id="imgabc">', images, "store"),
  /Bild: foto\.png/,
);
assert.equal(htmlToPlainText("<p>Hallo <strong>du</strong></p><p>Anhang: a.pdf</p>"), "Hallo du\nAnhang: a.pdf");
assert.equal(htmlToPlainText("<p>Gr&uuml;&szlig;e &amp; Co</p>"), "Grüße & Co");

assert.deepEqual(imageNameParts("imgabc123--my--file.png"), {
  uploadId: "imgabc123",
  filename: "my--file.png",
});
assert.equal(imageNameParts("ab--x.png"), null);
assert.equal(safeFilename("../geheim.pdf"), "geheim.pdf");
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
assert.equal(inspectUpload("angebot.pdf", "application/pdf", pdf)?.kind, "document");
assert.equal(inspectUpload("angebot.pdf", "application/pdf", new Uint8Array([1, 2, 3, 4])), null);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
assert.equal(inspectUpload("foto.png", "image/png", png)?.kind, "image");

console.log("mail html checks ok");
