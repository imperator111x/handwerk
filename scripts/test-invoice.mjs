import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.(?:ts|js|mjs|json)$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const invoice = await import("../src/lib/invoice.ts");
const font = await import("../src/lib/invoice-font.ts");
const { buildInvoicePdf } = await import("../src/lib/invoice-pdf.ts");

const RETENTION =
  "Der Rechnungsempfänger ist verpflichtet, die Rechnung zu steuerlichen Zwecken mindestens zwei Jahre aufzubewahren.";

assert.equal(invoice.INVOICE_RETENTION_NOTE, RETENTION);
assert.equal(invoice.invoiceNumber(7, "2026-10-20"), "R-2026-0007");
assert.equal(invoice.addIsoDays("2026-10-20", 14), "2026-11-03");
assert.equal(invoice.parseTaxNumber("12/345/67890"), "12/345/67890");
assert.equal(invoice.parseTaxNumber("123456789"), null);
assert.equal(invoice.parseTaxNumber("12/345/67890a"), null);
assert.equal(font.FONT_REGULAR_WIDTHS.length, 224);
assert.equal(font.FONT_BOLD_WIDTHS.length, 224);

const regular = inflateSync(font.INVOICE_FONT_REGULAR);
const bold = inflateSync(font.INVOICE_FONT_BOLD);
assert.equal(regular[0], 0);
assert.equal(regular[1], 1);
assert.equal(bold[0], 0);
assert.equal(bold[1], 1);
const icc = inflateSync(font.INVOICE_ICC);
assert.equal(Buffer.from(icc.subarray(36, 40)).toString("ascii"), "acsp");

const form = new FormData();
form.set("title", "Rollladen einstellen");
form.set("intro", "für die ausgeführte Leistung.");
form.set("invoice_date", "2026-10-20");
form.set("service_date", "2026-10-18");
form.append("line_label", "Stundenlohn");
form.append("line_qty", "2,5");
form.append("line_unit", "stunde");
form.append("line_price", "45,00");
form.append("line_label", "Anfahrt");
form.append("line_qty", "1");
form.append("line_unit", "pauschal");
form.append("line_price", "15,00");
const parsed = invoice.parseInvoiceForm(form, "2026-10-20");
assert.ok(parsed);
assert.equal(parsed.priceCents, 12750);
assert.equal(parsed.dueDate, "2026-11-03");
assert.equal(invoice.parseInvoiceForm(form, "2026-10-19"), null);

const future = new FormData();
future.set("title", "Rollladen einstellen");
future.set("intro", "");
future.set("invoice_date", "2026-10-21");
future.set("service_date", "2026-10-21");
future.append("line_label", "Stundenlohn");
future.append("line_qty", "1");
future.append("line_unit", "stunde");
future.append("line_price", "45,00");
assert.equal(invoice.parseInvoiceForm(future, "2026-10-20"), null);

const plain = invoice.invoicePlainText({
  priceCents: parsed.priceCents,
  dueDate: parsed.dueDate,
  number: "R-2026-0007",
});
assert.equal(invoice.INVOICE_MAIL_LEAD, "Hiermit übersende ich Ihnen die Rechnung in Höhe von:");
assert.match(plain, /^Hiermit übersende ich Ihnen die Rechnung in Höhe von:\n127,50\s€\n\nFällig am 3\. November 2026\./);
assert.match(plain, /Bei einer Überweisung bitte angeben:\nVerwendungszweck: R-2026-0007\nKontoinhaber: ZEUS-SERVICE\nIBAN: DE38 1001 4000 1598 1684 18\nSWIFT: SWNB DE BB/);
assert.match(plain, /Die Positionen stehen in der angehängten Rechnung\.$/);
assert.doesNotMatch(plain, /Stundenlohn|Anfahrt|Steuernummer|Kleinunternehmerregelung/);
const stornoMail = invoice.invoicePlainText({
  priceCents: parsed.priceCents,
  dueDate: parsed.dueDate,
  number: "R-2026-0008",
  storno: true,
});
assert.match(stornoMail, /^Hiermit übersende ich Ihnen die Stornorechnung in Höhe von:\n127,50\s€/);
assert.match(stornoMail, /Es ist kein Betrag zu zahlen\./);
assert.match(stornoMail, /angehängten Stornorechnung/);
assert.doesNotMatch(stornoMail, /Stundenlohn|IBAN|Verwendungszweck/);
const paidMail = invoice.invoicePlainText({
  priceCents: parsed.priceCents,
  dueDate: parsed.dueDate,
  number: "R-2026-0007",
  settled: true,
});
assert.doesNotMatch(paidMail, /IBAN|Verwendungszweck/);

const xml = invoice.buildInvoiceXml({
  number: "R-2026-0007",
  title: "Rollladen einstellen",
  lines: parsed.lines,
  invoiceDate: parsed.invoiceDate,
  serviceDate: parsed.serviceDate,
  dueDate: parsed.dueDate,
  taxNumber: "12/345/67890",
  buyerName: "Erika Muster",
  buyerEmail: "erika@example.com",
  buyerStreet: "Musterweg 1",
  buyerPostalCode: "22850",
  buyerCity: "Norderstedt",
});
assert.match(xml, /urn:cen\.eu:en16931:2017#compliant#urn:factur-x\.eu:1p0:en16931/);
assert.match(xml, /<ram:TypeCode>380<\/ram:TypeCode>/);
assert.match(xml, /<ram:CategoryCode>E<\/ram:CategoryCode>/);
assert.match(xml, /<ram:ID schemeID="FC">12\/345\/67890<\/ram:ID>/);
assert.match(xml, /<ram:IBANID>DE38100140001598168418<\/ram:IBANID>/);
assert.match(xml, /<ram:TypeCode>58<\/ram:TypeCode>/);
assert.match(xml, /<ram:DuePayableAmount>127\.50<\/ram:DuePayableAmount>/);
assert.match(xml, /<ram:TaxTotalAmount currencyID="EUR">0\.00<\/ram:TaxTotalAmount>/);
assert.ok(xml.includes(RETENTION));
assert.ok(xml.includes("unitCode=\"HUR\">2.50"));
assert.ok(xml.includes("unitCode=\"C62\">1.00"));

const pdf = buildInvoicePdf({
  number: "R-2026-0007",
  invoiceDateLabel: "20. Oktober 2026",
  serviceDateLabel: "18. Oktober 2026",
  dueDateLabel: "3. November 2026",
  taxNumber: "12/345/67890",
  buyerName: "Erika Muster",
  buyerEmail: "erika@example.com",
  buyerPhone: "+49 155 000",
  buyerStreet: "Musterweg 1",
  buyerPostalCode: "22850",
  buyerCity: "Norderstedt",
  title: "Rollladen einstellen",
  greeting: "Guten Tag Frau Muster,",
  intro: "für die ausgeführte Leistung.",
  lines: parsed.lines,
  invoiceDate: "2026-10-20",
  serviceDate: "2026-10-18",
  dueDate: "2026-11-03",
  authorName: "Leon Lütcke",
});
assert.ok(pdf.byteLength > 50_000);
const raw = new TextDecoder("latin1").decode(pdf);
const text = raw.replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(Number.parseInt(oct, 8)));
assert.match(raw, /^%PDF-1\.7/);
assert.match(raw, /factur-x\.xml/);
assert.match(raw, /\/AFRelationship \/Data/);
assert.match(raw, /pdfaid:part>3/);
assert.match(raw, /pdfaid:conformance>B/);
assert.match(raw, /fx:ConformanceLevel>EN 16931/);
assert.ok(Buffer.from(pdf).includes(Buffer.from(RETENTION, "utf8")));
assert.match(text, /Rechnung/);
assert.match(text, /R-2026-0007/);
assert.match(text, /Erika Muster/);
assert.match(text, /Musterweg 1/);
assert.match(text, /Steuernummer 12\/345\/67890/);
assert.match(text, /Rechnungsbetrag/);
assert.match(text, /127,50 EUR/);
assert.match(text, /Umsatzsteuer 0 %  0,00 EUR/);
assert.match(text, /Kleinunternehmerregelung/);
assert.match(text, /Zahlbar innerhalb von 14 Tagen ohne Abzug/);
assert.match(text, /Der Rechnungsempfänger ist verpflichtet/);
assert.match(text, /mindestens zwei Jahre aufzubewahren/);
assert.match(text, /Rechnungsnummer: R-2026-0007/);
assert.match(text, /Bei Zahlung bitte angeben/);

const stornoXml = invoice.buildInvoiceXml({
  number: "R-2026-0008",
  title: "Rollladen einstellen",
  lines: parsed.lines,
  invoiceDate: "2026-10-21",
  serviceDate: "2026-10-18",
  dueDate: "2026-10-21",
  taxNumber: "12/345/67890",
  buyerName: "Erika Muster",
  buyerEmail: "erika@example.com",
  buyerStreet: "Musterweg 1",
  buyerPostalCode: "22850",
  buyerCity: "Norderstedt",
  typeCode: "381",
  referenceNumber: "R-2026-0007",
  referenceDate: "2026-10-20",
  paymentTerms: "Es ist kein Betrag zu zahlen.",
});
assert.match(stornoXml, /<ram:TypeCode>381<\/ram:TypeCode>/);
assert.match(stornoXml, /<ram:IssuerAssignedID>R-2026-0007<\/ram:IssuerAssignedID>/);
assert.match(stornoXml, /Es ist kein Betrag zu zahlen\./);
assert.ok(stornoXml.includes(RETENTION));

const stornoPdf = buildInvoicePdf({
  number: "R-2026-0008",
  invoiceDateLabel: "21. Oktober 2026",
  serviceDateLabel: "18. Oktober 2026",
  dueDateLabel: "21. Oktober 2026",
  taxNumber: "12/345/67890",
  buyerName: "Erika Muster",
  buyerEmail: "erika@example.com",
  buyerPhone: "+49 155 000",
  buyerStreet: "Musterweg 1",
  buyerPostalCode: "22850",
  buyerCity: "Norderstedt",
  title: "Rollladen einstellen",
  greeting: "Guten Tag Frau Muster,",
  intro: "Diese Stornorechnung hebt die Rechnung R-2026-0007 vom 20. Oktober 2026 vollständig auf.",
  lines: parsed.lines,
  invoiceDate: "2026-10-21",
  serviceDate: "2026-10-18",
  dueDate: "2026-10-21",
  authorName: "Leon Lütcke",
  documentKind: "storno",
  referenceNumber: "R-2026-0007",
  referenceDate: "2026-10-20",
});
const stornoText = new TextDecoder("latin1").decode(stornoPdf).replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(Number.parseInt(oct, 8)));
assert.match(stornoText, /Stornorechnung/);
assert.match(stornoText, /Zur Rechnung R-2026-0007/);
assert.match(stornoText, /Es ist kein Betrag zu zahlen/);
assert.match(stornoText, /mindestens zwei Jahre aufzubewahren/);
assert.match(text, /IBAN: DE38 1001 4000 1598 1684 18/);

const noteBaselines = [...text.matchAll(/1 0 0 1 [\d.]+ ([\d.]+) Tm \(([^)]*)\) Tj/g)]
  .map((match) => ({ y: Number(match[1]), value: match[2] }))
  .filter((item) => /Kleinunternehmerregelung|ohne Abzug|Rechnungsempfänger/.test(item.value));
assert.equal(noteBaselines.length, 3);
for (let index = 1; index < noteBaselines.length; index += 1) {
  assert.ok(noteBaselines[index - 1].y - noteBaselines[index].y >= 20);
}

const start = Number(raw.match(/startxref\n(\d+)/)?.[1]);
assert.equal(raw.slice(start, start + 4), "xref");
const offsets = [...raw.matchAll(/(\d{10}) 00000 n/g)].map((match) => Number(match[1]));
for (const offset of offsets) {
  assert.match(raw.slice(offset, offset + 20), /^\d+ 0 obj/);
}

console.log("invoice checks ok", pdf.byteLength);
