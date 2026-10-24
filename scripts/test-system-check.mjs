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
assert.equal(check.systemCheckMayLink("live"), true);
assert.equal(check.systemCheckMayLink("off"), false);
assert.match(check.systemCheckFooter({ mode: "live", link: true }), /Jetzt bezahlen/);
assert.match(check.systemCheckFooter({ mode: "live", link: true }), /echte Zahlung/);
assert.match(check.systemCheckFooter({ mode: "test", link: true }), /kein Geld abgebucht/);
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
  check.systemCheckSentMessage({ kind: "rechnung", to: "leon.luetcke@icloud.com", mode: "live", link: true, linkFailed: false }),
  /Zahlungsknopf ist dabei/,
);
assert.match(
  check.systemCheckSentMessage({ kind: "rechnung", to: "leon.luetcke@icloud.com", mode: "live", link: true, linkFailed: false }),
  /echt bezahlt/,
);
assert.match(
  check.systemCheckSentMessage({ kind: "rechnung", to: "leon.luetcke@icloud.com", mode: "test", link: true, linkFailed: false }),
  /nichts abgebucht/,
);

const email = await import("../src/lib/email.ts");
const invoice = await import("../src/lib/invoice.ts");
const quote = await import("../src/lib/quote.ts");
const amount = quote.formatEuro(draft.priceCents);
const lead = invoice.INVOICE_MAIL_LEAD;
const plain = invoice.invoicePlainText({
  priceCents: draft.priceCents,
  dueDate: draft.dueDate,
  number: draft.number,
});
const prefix = `${lead}\n${amount}\n\n`;
const body = plain.startsWith(prefix) ? plain.slice(prefix.length) : plain;
const html = email.renderReplyEmailHtml({
  siteName: "Zeus-Service",
  siteUrl: "https://zeus-service.de",
  recipientName: "Testempfänger",
  subject: "Rechnung R-TEST-0000: Testrechnung",
  heading: "Testrechnung",
  eyebrow: "Rechnung R-TEST-0000",
  authorName: "Leon Lütcke",
  fromEmail: "info@zeus-service.de",
  bodyText: body,
  summaryLabel: lead,
  summaryAmount: amount,
  ctaUrl: "https://buy.stripe.com/live_example",
  ctaLabel: "Jetzt bezahlen",
  ctaFirst: true,
  ctaTone: "green",
  hideCtaUrl: true,
  footerNote: check.systemCheckFooter({ mode: "live", link: true }),
});
assert.match(html, /Jetzt bezahlen/);
assert.match(html, /#16a34a/);
assert.match(html, /echte Zahlung/);
assert.match(html, /href="https:\/\/buy\.stripe\.com\/live_example"/);

console.log("system check ok");
