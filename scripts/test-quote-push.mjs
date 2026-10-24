import assert from "node:assert/strict";
import { mailNotice, replyNotice, requestNotice } from "../src/lib/notice-copy.ts";
import { formatEuro, formatOfferDate, offerPlainText, parseEuroToCents } from "../src/lib/quote.ts";
import { bytesFromBase64Url, encryptPushPayload } from "../src/lib/web-push.ts";

assert.equal(parseEuroToCents("149"), 14900);
assert.equal(parseEuroToCents("149,50"), 14950);
assert.equal(parseEuroToCents("1.495"), null);
assert.equal(parseEuroToCents("0"), null);
assert.equal(formatEuro(14950), "149,50\u00a0€");
assert.equal(formatOfferDate("2026-10-31"), "31. Oktober 2026");
assert.deepEqual(requestNotice("Ndbdj jddj", "Objektbetreuung"), {
  title: "Neue Anfrage",
  body: "Ndbdj jddj hat angefragt: Objektbetreuung.",
});
assert.equal(replyNotice("Anna Beispiel", "Ohne Betreff").body, "Anna Beispiel hat auf eine Anfrage geantwortet.");
assert.equal(mailNotice("Max <max@example.com>", "Heizung tropft").body, "Max schreibt: Heizung tropft");
assert.match(offerPlainText({
  number: "A-2026-0001",
  title: "Rollladen einstellen",
  intro: "Ein Rollladen im Wohnzimmer.",
  lines: [{ label: "Stundenlohn", quantity: 2, unit: "stunde", unitCents: 4450 }],
  validUntil: "2026-11-02",
}), /89,00/);
assert.match(offerPlainText({
  number: "A-2026-0001",
  title: "Rollladen einstellen",
  intro: "",
  lines: [{ label: "Stundenlohn", quantity: 2, unit: "stunde", unitCents: 4450 }],
  validUntil: "2026-11-02",
}), /14 Tagen nach Ausführung/);

const asPublic = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const asPrivate = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
const uaPublic = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const salt = "DGv6ra1nlYgDCS1FRnbzlw";
const auth = "BTBZMqHH6r4Tts7J_aSIgg";
const expectedCipher = bytesFromBase64Url(
  "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
);

const publicBytes = bytesFromBase64Url(asPublic);
const privateBytes = bytesFromBase64Url(asPrivate);
assert.equal(publicBytes.byteLength, 65);
assert.equal(privateBytes.byteLength, 32);
const privateKey = await crypto.subtle.importKey(
  "jwk",
  {
    kty: "EC",
    crv: "P-256",
    d: asPrivate,
    x: bytesToTest(publicBytes.slice(1, 33)),
    y: bytesToTest(publicBytes.slice(33, 65)),
  },
  { name: "ECDH", namedCurve: "P-256" },
  false,
  ["deriveBits"],
);
const body = await encryptPushPayload({
  userPublicKey: bytesFromBase64Url(uaPublic),
  userAuth: bytesFromBase64Url(auth),
  payload: new TextEncoder().encode("When I grow up, I want to be a watermelon"),
  asPublicKey: publicBytes,
  asPrivateKey: privateKey,
  salt: bytesFromBase64Url(salt),
});
assert.deepEqual(body.slice(86), expectedCipher);
console.log("quote and push checks ok");

function bytesToTest(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
