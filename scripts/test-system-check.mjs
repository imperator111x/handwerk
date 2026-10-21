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

const check = await import("../src/lib/system-check.ts");
const invoices = await import("../src/lib/invoices.ts");

assert.equal(check.parseTestRecipient(" Leon.Luetcke@iCloud.com "), "leon.luetcke@icloud.com");
assert.equal(check.parseTestRecipient("keine-mail"), null);
assert.equal(check.parseTestRecipient(""), null);
assert.equal(check.systemCheckMayLink("test"), true);
assert.equal(check.systemCheckMayLink("live"), false);
assert.equal(check.systemCheckMayLink("off"), false);
assert.doesNotMatch(check.systemCheckShortText(), /IBAN|Verwendungszweck/);
assert.match(check.systemCheckShortText(), /nichts zu zahlen/);

const draft = check.systemCheckDraft("2026-10-21");
assert.equal(draft.number, "R-TEST-0000");
assert.equal(draft.priceCents, 12750);
assert.equal(draft.dueDate, "2026-11-04");

const pdf = check.renderSystemCheckPdf({
  today: "2026-10-21",
  taxNumber: "12/345/67890",
  buyerEmail: "leon.luetcke@icloud.com",
  authorName: "Leon Lütcke",
});
const raw = Buffer.from(pdf.bytes).toString("latin1");
assert.match(raw, /<ram:ID>urn:cen\.eu:en16931:2017<\/ram:ID>/);
assert.doesNotMatch(raw, /factur-x\.eu:1p0:en16931/);
assert.ok(raw.includes("Testposition"));
assert.ok(raw.includes("R-TEST-0000"));
assert.equal(pdf.filename, "Rechnung-R-TEST-0000.pdf");

assert.equal(
  invoices.invoiceMailFooter({ paymentUrl: "https://buy.stripe.com/test", paymentMode: "test" }),
  "Testmodus: Es wird kein Geld abgebucht. Sie können direkt auf diese E-Mail antworten.",
);
assert.equal(
  invoices.invoiceMailFooter({
    footerNote: "  Systemcheck: Diese Rechnung ist nicht verbucht. Es wird kein Geld abgebucht. Sie können direkt auf diese E-Mail antworten.  ",
    paymentUrl: "https://buy.stripe.com/test",
    paymentMode: "test",
  }),
  "Systemcheck: Diese Rechnung ist nicht verbucht. Es wird kein Geld abgebucht. Sie können direkt auf diese E-Mail antworten.",
);
assert.equal(
  check.systemCheckSentMessage({ kind: "kurz", to: "leon.luetcke@icloud.com", mode: "live", link: false, linkFailed: false }),
  "Die Testmail ist an leon.luetcke@icloud.com raus.",
);
assert.match(
  check.systemCheckSentMessage({ kind: "rechnung", to: "leon.luetcke@icloud.com", mode: "live", link: false, linkFailed: false }),
  /nicht verbucht/,
);
assert.doesNotMatch(
  check.systemCheckSentMessage({ kind: "rechnung", to: "leon.luetcke@icloud.com", mode: "live", link: false, linkFailed: false }),
  /Zahlungsknopf ist ein Testlink/,
);

console.log("system check ok");
