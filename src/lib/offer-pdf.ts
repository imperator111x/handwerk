import { siteConfig } from "../config/site";
import { OFFER_LOGO_BYTES, OFFER_LOGO_HEIGHT, OFFER_LOGO_WIDTH } from "./offer-logo";
import {
  OFFER_BANK_LINES,
  OFFER_DEFAULT_INTRO,
  OFFER_PAYMENT_TERMS,
  OFFER_SCOPE_NOTE,
  OFFER_UNIT_LABELS,
  formatEuroAmount,
  formatQuantity,
  lineTotalCents,
  offerTotalCents,
  type OfferLine,
} from "./quote";

export interface OfferPdfInput {
  number: string;
  dateLabel: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  customerStreet?: string | null;
  customerPostalCode?: string | null;
  customerCity?: string | null;
  title: string;
  greeting: string | null;
  intro: string;
  lines: OfferLine[];
  validUntilLabel: string;
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

export function buildOfferPdf(input: OfferPdfInput): Uint8Array {
  return serializePdf(layoutPages(input));
}

function layoutPages(input: OfferPdfInput): string[] {
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
      textRight(RIGHT, PAGE_H - 28, 11, "F2", `Angebot ${input.number}`, BLACK);
      textRight(RIGHT, PAGE_H - 42, 8, "F1", "Fortsetzung", MUTED);
      paint(`${BLACK} rg`);
      paint(`0 ${round(smallBottom - 10)} ${PAGE_W} 2 re f`);
      y = smallBottom - 26;
    }
  };

  const drawLogo = (x: number, yBottom: number, width: number) => {
    const height = (width * OFFER_LOGO_HEIGHT) / OFFER_LOGO_WIDTH;
    paint(`q ${round(width)} 0 0 ${round(height)} ${round(x)} ${round(yBottom)} cm /Im1 Do Q`);
  };

  const need = (height: number) => {
    if (y - height < 78) startPage(true);
  };

  startPage(false);
  const logoH = (LOGO_W * OFFER_LOGO_HEIGHT) / OFFER_LOGO_WIDTH;
  const logoBottom = PAGE_H - 28 - logoH;
  drawLogo(LEFT, logoBottom, LOGO_W);
  textRight(RIGHT, PAGE_H - 44, 20, "F2", "Angebot", BLACK);
  textRight(RIGHT, PAGE_H - 64, 10, "F1", input.number, MUTED);
  const ruleY = logoBottom - 12;
  paint(`${BLACK} rg`);
  paint(`0 ${round(ruleY)} ${PAGE_W} 3 re f`);

  const addressTop = ruleY - 22;
  textAt(LEFT, addressTop, 11, "F2", "Leon Lütcke", BLACK);
  textAt(LEFT, addressTop - 14, 10, "F1", "Berliner Allee 44a");
  textAt(LEFT, addressTop - 28, 10, "F1", "22850 Norderstedt");
  textAt(LEFT, addressTop - 42, 10, "F1", siteConfig.contact.phone, MUTED);
  textAt(LEFT, addressTop - 56, 10, "F1", siteConfig.contact.email, MUTED);
  textRight(RIGHT, addressTop, 10, "F1", `Norderstedt, ${input.dateLabel}`);
  textRight(RIGHT, addressTop - 14, 10, "F1", `Gültig bis ${input.validUntilLabel}`);
  textRight(RIGHT, addressTop - 28, 10, "F1", "zeus-service.de", MUTED);

  y = addressTop - 92;
  const place = [input.customerPostalCode?.trim() || "", input.customerCity?.trim() || ""].filter(Boolean).join(" ");
  const customerLines = [
    input.customerName,
    input.customerStreet?.trim() || "",
    place,
    input.customerEmail,
    input.customerPhone?.trim() || "",
  ].filter(Boolean);
  const paymentHint = [`Angebotsnummer: ${input.number}`, "Bei Zahlung bitte angeben"];
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
  for (const line of wrap(input.intro.trim() || OFFER_DEFAULT_INTRO, 92)) {
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
    const wrapped = wrap(line.label, 34);
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

  need(36);
  y -= 6;
  paint(`${BLACK} rg`);
  paint(`${LEFT} ${round(y - 6)} ${WIDTH} 24 re f`);
  textAt(LEFT + 8, y, 11, "F2", "Festpreis", WHITE);
  textRight(RIGHT - 6, y, 11, "F2", formatEuroAmount(offerTotalCents(input.lines)), WHITE);
  y -= 32;

  const notes = [
    OFFER_PAYMENT_TERMS,
    OFFER_SCOPE_NOTE,
    `Dieses Angebot ist gültig bis ${input.validUntilLabel}.`,
  ];
  for (const note of notes) {
    need(14);
    textAt(LEFT, y, 10, "F1", note);
    y -= 14;
  }
  y -= 16;

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
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function textWidth(value: string, size: number, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const ch of value) {
    const index = winAnsiIndex(ch);
    units += index === null ? 500 : table[index];
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

function serializePdf(streams: string[]): Uint8Array {
  const fontRegular = 3;
  const fontBold = 4;
  const imageId = 5;
  const pageIds: number[] = [];
  const objects = new Map<number, Uint8Array>();
  let nextId = 6;
  for (const stream of streams) {
    const contentId = nextId;
    nextId += 1;
    const pageId = nextId;
    nextId += 1;
    pageIds.push(pageId);
    objects.set(contentId, latin1(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
    objects.set(
      pageId,
      latin1(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> /XObject << /Im1 ${imageId} 0 R >> >> >>`,
      ),
    );
  }
  objects.set(1, latin1(`<< /Type /Catalog /Pages 2 0 R >>`));
  objects.set(2, latin1(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`));
  objects.set(fontRegular, latin1(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`));
  objects.set(fontBold, latin1(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`));
  objects.set(
    imageId,
    concat([
      latin1(
        `<< /Type /XObject /Subtype /Image /Width ${OFFER_LOGO_WIDTH} /Height ${OFFER_LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${OFFER_LOGO_BYTES.length} >>\nstream\n`,
      ),
      OFFER_LOGO_BYTES,
      latin1("\nendstream"),
    ]),
  );

  const count = nextId - 1;
  const parts: Uint8Array[] = [latin1("%PDF-1.4\n")];
  const offsets = [0];
  for (let id = 1; id <= count; id += 1) {
    offsets.push(parts.reduce((sum, part) => sum + part.length, 0));
    parts.push(latin1(`${id} 0 obj\n`), objects.get(id) ?? latin1("<<>>"), latin1("\nendobj\n"));
  }
  const startxref = parts.reduce((sum, part) => sum + part.length, 0);
  let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= count; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer << /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  parts.push(latin1(xref));
  return concat(parts);
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

/** Helvetica-Breiten, WinAnsi ab Zeichen 32. */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 222, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  222, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 500,
  556, 500, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 500, 611, 500,
  500, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 500, 500, 667,
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
];

/** Helvetica-Bold-Breiten, WinAnsi ab Zeichen 32. */
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  278, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 500,
  556, 500, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 500, 611, 500,
  500, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 500, 500, 667,
  278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278,
  611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556,
];
