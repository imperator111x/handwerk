import assert from "node:assert/strict";
import PostalMime from "postal-mime";
import {
  buildReplyAddress,
  formatMessageIdHeader,
  normalizeMessageId,
  parseReplyToken,
  verifyReplyToken,
} from "../src/lib/reply-address.ts";
import { extractCustomerText } from "../src/lib/inbound-mail.ts";

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
  "> vielen Dank fuer Ihre Anfrage.",
].join("\n");
assert.equal(extractCustomerText(quoted, ""), "Ja, der Termin passt.");
assert.equal(extractCustomerText("Kekdjje\n\nSent from my iPhone", ""), "Kekdjje");
assert.equal(
  extractCustomerText("", "<p>Hallo</p><p>Am Montag schrieb team@zeus-service.de:</p><p>alt</p>"),
  "Hallo",
);

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
