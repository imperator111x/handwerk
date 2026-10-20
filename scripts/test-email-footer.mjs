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

const { renderReplyEmailHtml, renderReplyEmailText } = await import("../src/lib/email.ts");

const impressum = "ZEUS-SERVICE Leon Lütcke, Berliner Allee 44a, 22850 Norderstedt";
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
assert.ok(html.includes(impressum));
assert.ok(html.indexOf("Mit freundlichen Grüßen") < html.indexOf(impressum));
assert.equal(text.trimEnd().endsWith(impressum), true);

console.log("email footer checks ok");
