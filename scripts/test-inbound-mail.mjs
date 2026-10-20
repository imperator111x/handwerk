import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import PostalMime from "postal-mime";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers") {
      return {
        url: new URL("./cloudflare-workers-stub.mjs", import.meta.url).href,
        shortCircuit: true,
      };
    }
    if (specifier.startsWith(".") && !/\.(?:ts|js|mjs|json)$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  buildReplyAddress,
  formatMessageIdHeader,
  normalizeMessageId,
  parseReplyToken,
  verifyReplyToken,
} = await import("../src/lib/reply-address.ts");
const { extractCustomerText } = await import("../src/lib/inbound-mail.ts");

const secret = "test-secret";
const address = await buildReplyAddress(secret, 2, "antwort.zeus-service.de");
assert.ok(address);
assert.match(address, /^r\+2\.[a-f0-9]{16}@antwort\.zeus-service\.de$/);

const token = parseReplyToken(`Kunde <${address}>`);
assert.ok(token);
assert.equal(token.requestId, 2);
assert.equal(await verifyReplyToken(secret, token.requestId, token.signature), true);
assert.equal(await verifyReplyToken("other-secret", token.requestId, token.signature), false);
assert.equal(await verifyReplyToken(secret, 3, token.signature), false);
assert.equal(parseReplyToken("r+2.abcd@antwort.zeus-service.de"), null);

const quoted = [
  "Ja, der Termin passt.",
  "",
  "Am 19.10.2026 um 10:00 schrieb Zeus-Service:",
  "> vielen Dank für Ihre Anfrage.",
].join("\n");
assert.equal(extractCustomerText(quoted, ""), "Ja, der Termin passt.");
assert.equal(extractCustomerText("Kekdjje\n\nSent from my iPhone", ""), "Kekdjje");
assert.equal(
  extractCustomerText("", "<p>Hallo</p><p>Am Montag schrieb team@zeus-service.de:</p><p>alt</p>"),
  "Hallo",
);
assert.equal(extractCustomerText("Gr&uuml;&szlig;e &amp; &raquo;Pr&uuml;fung&laquo;", ""), "Grüße & »Prüfung«");
assert.equal(extractCustomerText("", "<p>F&uuml;r &auml;hnliche F&auml;lle</p>"), "Für ähnliche Fälle");
assert.equal(extractCustomerText("&#252;ber &#xFC;ber", ""), "über über");

const raw = [
  "From: Erika Muster <erika@example.com>",
  "To: r+2.0123abcd0123abcd@antwort.zeus-service.de",
  "Subject: Re: Ihre Anfrage",
  "Message-ID: <kunde-42@example.com>",
  "In-Reply-To: <outbound-7@zeus-service.de>",
  "References: <outbound-7@zeus-service.de>",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Der Monteur kann Dienstag kommen.",
  "",
  "Am 19.10.2026 um 09:00 schrieb Zeus-Service:",
  "> Wir melden uns.",
  "",
].join("\r\n");

const parsed = await PostalMime.parse(raw);
assert.equal(parsed.subject, "Re: Ihre Anfrage");
assert.equal(parsed.from?.address, "erika@example.com");
assert.equal(parsed.from?.name, "Erika Muster");
assert.equal(normalizeMessageId(parsed.messageId), "kunde-42@example.com");
assert.equal(formatMessageIdHeader(parsed.inReplyTo), "<outbound-7@zeus-service.de>");
assert.equal(parsed.to?.[0]?.address, "r+2.0123abcd0123abcd@antwort.zeus-service.de");
assert.equal(
  extractCustomerText(parsed.text ?? "", parsed.html ?? ""),
  "Der Monteur kann Dienstag kommen.",
);

console.log("inbound-mail checks ok");
