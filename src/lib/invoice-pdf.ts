import { OFFER_LOGO_BYTES, OFFER_LOGO_HEIGHT, OFFER_LOGO_WIDTH } from "./offer-logo";
import { siteConfig } from "../config/site";
import {
  FONT_BOLD_META,
  FONT_BOLD_WIDTHS,
  FONT_REGULAR_META,
  FONT_REGULAR_WIDTHS,
  INVOICE_FONT_BOLD,
  INVOICE_FONT_REGULAR,
  INVOICE_ICC,
} from "./invoice-font";
import {
  INVOICE_DEFAULT_INTRO,
  INVOICE_PAYMENT_TERMS,
  INVOICE_RETENTION_NOTE,
  SELLER,
  buildInvoiceXml,
} from "./invoice";
import {
  OFFER_BANK_LINES,
  OFFER_TAX_NOTE,
  OFFER_UNIT_LABELS,
  formatEuroAmount,
  formatQuantity,
  lineTotalCents,
  offerTotalCents,
  type OfferLine,
} from "./quote";

export interface InvoicePdfInput {
  number: string;
  invoiceDateLabel: string;
  serviceDateLabel: string;
  dueDateLabel: string;
  taxNumber: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string | null;
  buyerStreet: string;
  buyerPostalCode: string;
  buyerCity: string;
  title: string;
  greeting: string | null;
  intro: string;
  lines: OfferLine[];
  invoiceDate: string;
  serviceDate: string;
  dueDate: string;
  authorName: string;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LEFT = 48;
const RIGHT = 547;
const WIDTH = RIGHT - LEFT;
const BLACK = "0 0 0";
const INK = "0.15 0.15 0.15";
const MUTED = "0.40 0.40 0.40";
const WHITE = "1 1 1";
const BAND = "0.94 0.94 0.94";
const RULE = "0.75 0.75 0.75";
const LOGO_W = 190;

const WIN_EXTRA: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "„": 0x84,
  "…": 0x85,
  "–": 0x96,
  "—": 0x97,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
};

export function buildInvoicePdf(input: InvoicePdfInput): Uint8Array {
  const xml = buildInvoiceXml({
    number: input.number,
    title: input.title,
    lines: input.lines,
    invoiceDate: input.invoiceDate,
    serviceDate: input.serviceDate,
    dueDate: input.dueDate,
    taxNumber: input.taxNumber,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    buyerStreet: input.buyerStreet,
    buyerPostalCode: input.buyerPostalCode,
    buyerCity: input.buyerCity,
  });
  return serializeZugferd(layoutPages(input), xml, input);
}

function layoutPages(input: InvoicePdfInput): string[] {
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = 760;
  let started = false;

  const paint = (command: string) => {
    ops.push(command);
  };
  const fill = (color: string) => paint(`${color} rg`);
  const useFont = (font: "F1" | "F2", size: number) => paint(`/${font} ${size} Tf`);
  const textAt = (x: number, baseline: number, size: number, font: "F1" | "F2", value: string, color = INK) => {
    const shown = value.trim();
    if (!shown) return;
    fill(color);
    useFont(font, size);
    paint(`BT 1 0 0 1 ${round(x)} ${round(baseline)} Tm ${pdfText(shown)} Tj ET`);
  };
  const textRight = (right: number, baseline: number, size: number, font: "F1" | "F2", value: string, color = INK) => {
    textAt(right - textWidth(value, size, font === "F2"), baseline, size, font, value, color);
  };
  const startPage = (continued: boolean) => {
    if (started) pages.push(ops);
    started = true;
    ops = [];
    paint(`${RULE} RG`);
    paint(`0.6 w ${LEFT} 62 m ${RIGHT} 62 l S`);
    fill(MUTED);
    useFont("F1", 8);
    paint(`BT 1 0 0 1 ${LEFT} 46 Tm ${pdfText("ZEUS-SERVICE · Leon Lütcke · Berliner Allee 44a · 22850 Norderstedt")} Tj ET`);
    paint(`BT 1 0 0 1 ${LEFT} 34 Tm ${pdfText(`${siteConfig.contact.phone} · ${siteConfig.contact.email} · zeus-service.de`)} Tj ET`);
    const bankWidth = Math.max(...OFFER_BANK_LINES.map((line) => textWidth(line, 8, false)));
    const bankX = RIGHT - bankWidth;
    OFFER_BANK_LINES.forEach((line, index) => {
      textAt(bankX, 46 - index * 12, 8, "F1", line, MUTED);
    });
    if (continued) {
      const smallW = 120;
      const smallH = (smallW * OFFER_LOGO_HEIGHT) / OFFER_LOGO_WIDTH;
      const smallBottom = PAGE_H - 16 - smallH;
      paint(`q ${round(smallW)} 0 0 ${round(smallH)} ${LEFT} ${round(smallBottom)} cm /Im1 Do Q`);
      textRight(RIGHT, PAGE_H - 28, 11, "F2", `Rechnung ${input.number}`, BLACK);
      textRight(RIGHT, PAGE_H - 42, 8, "F1", "Fortsetzung", MUTED);
      paint(`${BLACK} rg`);
      paint(`0 ${round(smallBottom - 10)} ${PAGE_W} 2 re f`);
      y = smallBottom - 26;
    }
  };
  const need = (height: number) => {
    if (y - height < 78) startPage(true);
  };

  startPage(false);
  const logoH = (LOGO_W * OFFER_LOGO_HEIGHT) / OFFER_LOGO_WIDTH;
  const logoBottom = PAGE_H - 28 - logoH;
  paint(`q ${round(LOGO_W)} 0 0 ${round(logoH)} ${LEFT} ${round(logoBottom)} cm /Im1 Do Q`);
  textRight(RIGHT, PAGE_H - 44, 20, "F2", "Rechnung", BLACK);
  textRight(RIGHT, PAGE_H - 64, 10, "F1", input.number, MUTED);
  const ruleY = logoBottom - 12;
  paint(`${BLACK} rg`);
  paint(`0 ${round(ruleY)} ${PAGE_W} 3 re f`);

  const addressTop = ruleY - 22;
  textAt(LEFT, addressTop, 11, "F2", SELLER.personName, BLACK);
  textAt(LEFT, addressTop - 14, 10, "F1", SELLER.street);
  textAt(LEFT, addressTop - 28, 10, "F1", `${SELLER.postalCode} ${SELLER.city}`);
  textAt(LEFT, addressTop - 42, 10, "F1", siteConfig.contact.phone, MUTED);
  textAt(LEFT, addressTop - 56, 10, "F1", siteConfig.contact.email, MUTED);
  textAt(LEFT, addressTop - 70, 10, "F1", `Steuernummer ${input.taxNumber}`, MUTED);
  const meta = [
    `Rechnungsdatum ${input.invoiceDateLabel}`,
    `Leistungsdatum ${input.serviceDateLabel}`,
    `Fällig am ${input.dueDateLabel}`,
    "Norderstedt",
  ];
  meta.forEach((line, index) => {
    textRight(RIGHT, addressTop - index * 14, 10, "F1", line, index === 3 ? MUTED : INK);
  });

  y = addressTop - 108;
  const place = [input.buyerPostalCode.trim(), input.buyerCity.trim()].filter(Boolean).join(" ");
  const customerLines = [input.buyerName, input.buyerStreet.trim(), place, input.buyerEmail, input.buyerPhone?.trim() || ""].filter(Boolean);
  const paymentHint = [`Rechnungsnummer: ${input.number}`, "Bei Zahlung bitte angeben"];
  const hintWidth = Math.max(...paymentHint.map((line) => textWidth(line, 10, false)));
  const hintX = RIGHT - hintWidth;
  paymentHint.forEach((line, index) => {
    textAt(hintX, y - index * 14, 10, "F1", line);
  });
  textAt(LEFT, y, 8, "F2", "An", MUTED);
  customerLines.forEach((line, index) => {
    textAt(LEFT, y - 14 - index * 14, 11, index === 0 ? "F2" : "F1", line);
  });
  y -= 14 + customerLines.length * 14 + 22;

  need(36);
  textAt(LEFT, y, 13, "F2", input.title, BLACK);
  y -= 22;
  if (input.greeting) {
    need(16);
    textAt(LEFT, y, 11, "F1", input.greeting);
    y -= 18;
  }
  for (const line of wrap(input.intro.trim() || INVOICE_DEFAULT_INTRO, 92)) {
    need(14);
    textAt(LEFT, y, 11, "F1", line);
    y -= 14;
  }
  y -= 10;

  const drawTableHead = () => {
    need(22);
    paint(`${BLACK} rg`);
    paint(`${LEFT} ${round(y - 5)} ${WIDTH} 18 re f`);
    textAt(LEFT + 6, y, 8, "F2", "Pos", WHITE);
    textAt(LEFT + 32, y, 8, "F2", "Position", WHITE);
    textRight(318, y, 8, "F2", "Menge", WHITE);
    textAt(328, y, 8, "F2", "Einheit", WHITE);
    textRight(445, y, 8, "F2", "Einzelpreis", WHITE);
    textRight(RIGHT - 6, y, 8, "F2", "Gesamt", WHITE);
    y -= 20;
  };
  drawTableHead();
  input.lines.forEach((line, index) => {
    const wrapped = wrapToWidth(line.label, 150, 9);
    const rowHeight = Math.max(18, wrapped.length * 12 + 6);
    if (y - rowHeight < 78) {
      startPage(true);
      drawTableHead();
    }
    if (index % 2 === 0) {
      paint(`${BAND} rg`);
      paint(`${LEFT} ${round(y - rowHeight + 12)} ${WIDTH} ${rowHeight} re f`);
    }
    textAt(LEFT + 6, y, 9, "F1", String(index + 1));
    wrapped.forEach((part, lineIndex) => {
      textAt(LEFT + 32, y - lineIndex * 12, 9, "F1", part);
    });
    textRight(318, y, 9, "F1", formatQuantity(line.quantity));
    textAt(328, y, 9, "F1", OFFER_UNIT_LABELS[line.unit]);
    textRight(445, y, 9, "F1", formatEuroAmount(line.unitCents));
    textRight(RIGHT - 6, y, 9, "F2", formatEuroAmount(lineTotalCents(line)));
    y -= rowHeight;
  });

  const total = formatEuroAmount(offerTotalCents(input.lines));
  need(36);
  y -= 6;
  paint(`${BLACK} rg`);
  paint(`${LEFT} ${round(y - 6)} ${WIDTH} 24 re f`);
  textAt(LEFT + 8, y, 11, "F2", "Rechnungsbetrag", WHITE);
  textRight(RIGHT - 6, y, 11, "F2", total, WHITE);
  y -= 28;
  need(28);
  textRight(RIGHT, y, 10, "F1", `Nettobetrag ${total}`);
  y -= 14;
  textRight(RIGHT, y, 10, "F1", "Umsatzsteuer 0 %  0,00 EUR");
  y -= 22;

  const notes = [OFFER_TAX_NOTE, INVOICE_PAYMENT_TERMS, INVOICE_RETENTION_NOTE];
  for (const note of notes) {
    const lines = wrapToWidth(note, WIDTH, 10);
    for (const line of lines) {
      need(14);
      textAt(LEFT, y, 10, "F1", line);
      y -= 14;
    }
    y -= 10;
  }
  y -= 6;
  need(56);
  paint(`${BLACK} RG`);
  paint(`1 w ${LEFT} ${round(y + 12)} m ${LEFT + 150} ${round(y + 12)} l S`);
  textAt(LEFT, y, 11, "F1", "Mit freundlichen Grüßen");
  y -= 18;
  textAt(LEFT, y, 11, "F2", input.authorName, BLACK);
  y -= 14;
  textAt(LEFT, y, 10, "F1", "Zeus-Service");

  if (started) pages.push(ops);
  return pages.map((page) => page.join("\n"));
}

function wrapToWidth(text: string, maxWidth: number, size: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (textWidth(next, size, false) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function wrap(text: string, max: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

function textWidth(value: string, size: number, bold: boolean): number {
  const table = bold ? FONT_BOLD_WIDTHS : FONT_REGULAR_WIDTHS;
  let units = 0;
  for (const ch of value) {
    const index = winAnsiIndex(ch);
    units += index === null ? 500 : table[index] ?? 500;
  }
  return (units / 1000) * size;
}

function winAnsiIndex(ch: string): number | null {
  const mapped = WIN_EXTRA[ch];
  if (mapped) return mapped - 32;
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 32 && code <= 255) return code - 32;
  return null;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function pdfText(value: string): string {
  let out = "";
  for (const ch of value.replace(/\u20ac/g, "EUR")) {
    const code = ch.codePointAt(0) ?? 63;
    if (ch === "(" || ch === ")" || ch === "\\") {
      out += `\\${ch}`;
      continue;
    }
    if (code >= 32 && code <= 126) {
      out += ch;
      continue;
    }
    if (code >= 0xa0 && code <= 0xff) {
      out += `\\${code.toString(8).padStart(3, "0")}`;
      continue;
    }
    const mapped = WIN_EXTRA[ch];
    if (mapped) out += `\\${mapped.toString(8).padStart(3, "0")}`;
  }
  return `(${out})`;
}

function serializeZugferd(streams: string[], xml: string, input: InvoicePdfInput): Uint8Array {
  const xmlBytes = utf8(xml);
  const created = `D:${input.invoiceDate.replace(/-/g, "")}120000Z`;
  const xmp = xmpPacket(input, created);
  const xmpBytes = utf8(xmp);
  const objects = new Map<number, Uint8Array>();
  const fontRegular = 3;
  const fontBold = 4;
  const toUnicode = 5;
  const fontFileRegular = 6;
  const fontFileBold = 7;
  const imageId = 8;
  const iccId = 9;
  const metadataId = 10;
  const xmlId = 11;
  const fileSpecId = 12;
  const infoId = 13;
  objects.set(fontFileRegular, streamObject(INVOICE_FONT_REGULAR, `/Filter /FlateDecode /Length ${INVOICE_FONT_REGULAR.length}`));
  objects.set(fontFileBold, streamObject(INVOICE_FONT_BOLD, `/Filter /FlateDecode /Length ${INVOICE_FONT_BOLD.length}`));
  objects.set(toUnicode, streamObject(utf8(toUnicodeCMap()), `/Length ${utf8(toUnicodeCMap()).length}`));
  objects.set(fontRegular, latin1(fontDictionary("LIBER1+LiberationSans", FONT_REGULAR_WIDTHS, FONT_REGULAR_META, 80, fontFileRegular, toUnicode)));
  objects.set(fontBold, latin1(fontDictionary("LIBER2+LiberationSans-Bold", FONT_BOLD_WIDTHS, FONT_BOLD_META, 140, fontFileBold, toUnicode)));
  objects.set(
    imageId,
    concat([
      latin1(
        `<< /Type /XObject /Subtype /Image /Width ${OFFER_LOGO_WIDTH} /Height ${OFFER_LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate false /Filter /FlateDecode /Length ${OFFER_LOGO_BYTES.length} >>\nstream\n`,
      ),
      OFFER_LOGO_BYTES,
      latin1("\nendstream"),
    ]),
  );
  objects.set(iccId, streamObject(INVOICE_ICC, `/N 3 /Filter /FlateDecode /Length ${INVOICE_ICC.length}`));
  objects.set(metadataId, streamObject(xmpBytes, `/Type /Metadata /Subtype /XML /Length ${xmpBytes.length}`));
  const checksum = md5(xmlBytes);
  objects.set(
    xmlId,
    streamObject(
      xmlBytes,
      `/Type /EmbeddedFile /Subtype /text#2Fxml /Params << /Size ${xmlBytes.length} /ModDate ${pdfText(created)} /CheckSum <${hex(checksum)}> >> /Length ${xmlBytes.length}`,
    ),
  );
  objects.set(
    fileSpecId,
    latin1(
      `<< /Type /Filespec /F (factur-x.xml) /UF (factur-x.xml) /Desc (Factur-X invoice) /AFRelationship /Data /EF << /F ${xmlId} 0 R /UF ${xmlId} 0 R >> >>`,
    ),
  );
  objects.set(
    infoId,
    latin1(
      `<< /Title ${pdfText(`Rechnung ${input.number}`)} /Author ${pdfText(SELLER.personName)} /Creator ${pdfText("Zeus-Service")} /Producer ${pdfText("Zeus-Service")} /CreationDate ${pdfText(created)} /ModDate ${pdfText(created)} /Trapped /False >>`,
    ),
  );

  const pageIds: number[] = [];
  let nextId = 14;
  for (const stream of streams) {
    const contentId = nextId;
    nextId += 1;
    const pageId = nextId;
    nextId += 1;
    pageIds.push(pageId);
    const content = latin1(stream);
    objects.set(contentId, streamObject(content, `/Length ${content.length}`));
    objects.set(
      pageId,
      latin1(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> /XObject << /Im1 ${imageId} 0 R >> >> >>`,
      ),
    );
  }
  objects.set(
    1,
    latin1(
      `<< /Type /Catalog /Pages 2 0 R /Metadata ${metadataId} 0 R /OutputIntents [ << /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1) /DestOutputProfile ${iccId} 0 R /RegistryName (http://www.color.org) >> ] /AF [ ${fileSpecId} 0 R ] /Names << /EmbeddedFiles << /Names [ (factur-x.xml) ${fileSpecId} 0 R ] >> >> >>`,
    ),
  );
  objects.set(2, latin1(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`));

  const count = nextId - 1;
  const parts: Uint8Array[] = [latin1("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  for (let id = 1; id <= count; id += 1) {
    offsets.push(parts.reduce((sum, part) => sum + part.length, 0));
    parts.push(latin1(`${id} 0 obj\n`), objects.get(id) ?? latin1("<<>>"), latin1("\nendobj\n"));
  }
  const startxref = parts.reduce((sum, part) => sum + part.length, 0);
  const idBytes = md5(utf8(`${input.number}|${xml.length}|${input.invoiceDate}`));
  const fileId = hex(idBytes);
  let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= count; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer << /Size ${count + 1} /Root 1 0 R /Info ${infoId} 0 R /ID [<${fileId}> <${fileId}>] >>\nstartxref\n${startxref}\n%%EOF`;
  parts.push(latin1(xref));
  return concat(parts);
}

function fontDictionary(
  name: string,
  widths: readonly number[],
  meta: { ascent: number; descent: number; capHeight: number; bbox: readonly number[] },
  stemV: number,
  fileId: number,
  unicodeId: number,
): string {
  return `<< /Type /Font /Subtype /TrueType /BaseFont /${name} /FirstChar 32 /LastChar 255 /Widths [${widths.join(" ")}] /FontDescriptor << /Type /FontDescriptor /FontName /${name} /Flags 32 /FontBBox [${meta.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${meta.ascent} /Descent ${meta.descent} /CapHeight ${meta.capHeight} /StemV ${stemV} /FontFile2 ${fileId} 0 R >> /Encoding /WinAnsiEncoding /ToUnicode ${unicodeId} 0 R >>`;
}

function toUnicodeCMap(): string {
  const pairs: string[] = [];
  for (let code = 32; code <= 255; code += 1) {
    const unicode = winAnsiUnicode(code);
    if (unicode === null) continue;
    pairs.push(`<${code.toString(16).padStart(2, "0").toUpperCase()}> <${unicode.toString(16).padStart(4, "0").toUpperCase()}>`);
  }
  const chunks: string[] = [];
  for (let index = 0; index < pairs.length; index += 100) {
    const slice = pairs.slice(index, index + 100);
    chunks.push(`${slice.length} beginbfchar\n${slice.join("\n")}\nendbfchar`);
  }
  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<20> <FF>
endcodespacerange
${chunks.join("\n")}
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;
}

function winAnsiUnicode(code: number): number | null {
  const extra: Record<number, number> = {
    0x80: 0x20ac,
    0x82: 0x201a,
    0x83: 0x0192,
    0x84: 0x201e,
    0x85: 0x2026,
    0x86: 0x2020,
    0x87: 0x2021,
    0x88: 0x02c6,
    0x89: 0x2030,
    0x8a: 0x0160,
    0x8b: 0x2039,
    0x8c: 0x0152,
    0x8e: 0x017d,
    0x91: 0x2018,
    0x92: 0x2019,
    0x93: 0x201c,
    0x94: 0x201d,
    0x95: 0x2022,
    0x96: 0x2013,
    0x97: 0x2014,
    0x98: 0x02dc,
    0x99: 0x2122,
    0x9a: 0x0161,
    0x9b: 0x203a,
    0x9c: 0x0153,
    0x9e: 0x017e,
    0x9f: 0x0178,
  };
  if (extra[code]) return extra[code];
  if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) return code;
  return null;
}

function xmpPacket(input: InvoicePdfInput, created: string): string {
  const iso = `${input.invoiceDate}T12:00:00Z`;
  const title = xmlEscape(`Rechnung ${input.number}`);
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
   <pdf:Producer>Zeus-Service</pdf:Producer>
   <xmp:CreatorTool>Zeus-Service</xmp:CreatorTool>
   <xmp:CreateDate>${iso}</xmp:CreateDate>
   <xmp:ModifyDate>${iso}</xmp:ModifyDate>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${xmlEscape(SELLER.personName)}</rdf:li></rdf:Seq></dc:creator>
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>DocumentType</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>INVOICE</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>Version</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description>
        </rdf:li>
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
  void created;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function streamObject(data: Uint8Array, dict: string): Uint8Array {
  return concat([latin1(`<< ${dict} >>\nstream\n`), data, latin1("\nendstream")]);
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function latin1(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function md5(bytes: Uint8Array): Uint8Array {
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const k = new Uint32Array(64);
  for (let index = 0; index < 64; index += 1) k[index] = Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32);
  const bitLength = bytes.length * 8;
  const paddedLength = ((bytes.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLength >>> 0, true);
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 2 ** 32), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < padded.length; offset += 64) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f = 0;
      let g = 0;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const next = d;
      const sum = (a + f + k[i] + view.getUint32(offset + g * 4, true)) >>> 0;
      d = c;
      c = b;
      b = (b + ((sum << s[i]) | (sum >>> (32 - s[i])))) >>> 0;
      a = next;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const digest = new DataView(out.buffer);
  digest.setUint32(0, a0, true);
  digest.setUint32(4, b0, true);
  digest.setUint32(8, c0, true);
  digest.setUint32(12, d0, true);
  return out;
}
