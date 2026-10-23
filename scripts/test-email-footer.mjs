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

const {
  EMAIL_LOGO_CID,
  emailLogoAttachment,
  renderReplyEmailHtml,
  renderReplyEmailText,
} = await import("../src/lib/email.ts");

const impressum = ["ZEUS-SERVICE", "Leon Lütcke", "Berliner Allee 44a", "22850 Norderstedt"];
const input = {
  siteName: "Zeus-Service",
  siteUrl: "https://zeus-service.de",
  recipientName: "Anna",
  subject: "Ihr Termin",
  bodyText: "Wir kommen vorbei.",
  authorName: "Leon Lütcke",
  fromEmail: "website@zeus-service.de",
};

const html = renderReplyEmailHtml(input);
const text = renderReplyEmailText(input);
assert.equal(html.trimEnd().endsWith("</html>"), true);
assert.match(html, new RegExp(`src="cid:${EMAIL_LOGO_CID}"`));
assert.doesNotMatch(html, /data:image\/png;base64,/);
const logo = emailLogoAttachment();
assert.equal(logo.contentId, EMAIL_LOGO_CID);
assert.equal(logo.disposition, "inline");
assert.equal(logo.type, "image/png");
assert.ok(logo.content instanceof Uint8Array && logo.content.byteLength > 1000);
let cursor = html.indexOf("Mit freundlichen Grüßen");
assert.ok(cursor > 0);
for (const line of impressum) {
  const next = html.indexOf(line, cursor);
  assert.ok(next > cursor, line);
  cursor = next + line.length;
}
assert.equal(html.includes(">Impressum<"), false);
assert.equal(text.trimEnd().endsWith(impressum.join("\n")), true);

console.log("email footer checks ok");
