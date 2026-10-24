import { OFFER_LOGO_BYTES, OFFER_LOGO_HEIGHT, OFFER_LOGO_WIDTH } from "./offer-logo";
import { formatOfferDate } from "./quote";
import {
  TIMESHEET_SIGN_NOTE,
  formatDecimalHours,
  formatMinutes,
  jpegSize,
  netMinutes,
  type TimesheetLine,
} from "./timesheet";

export interface TimesheetPdfInput {
  number: string;
  dateLabel: string;
  customerName: string;
  street: string;
  postalCode: string;
  city: string;
  employeeName: string;
  workDate: string;
  note: string;
  lines: TimesheetLine[];
  totalMinutes: number;
  contentHash: string | null;
  signedAtLabel: string | null;
  signerName: string;
  signature: Uint8Array | null;
  customerSignerName: string;
  customerSignature: Uint8Array | null;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const LEFT = 48;
const RIGHT = 547;
const LOGO_W = 190;

type PdfImage = {
  key: "logo" | "employee" | "customer";
  objectId: number;
  bytes: Uint8Array;
  width: number;
  height: number;
  filter: "FlateDecode" | "DCTDecode";
};

export function buildTimesheetPdf(input: TimesheetPdfInput): Uint8Array {
  const images: PdfImage[] = [
    {
      key: "logo",
      objectId: 5,
      bytes: OFFER_LOGO_BYTES,
      width: OFFER_LOGO_WIDTH,
      height: OFFER_LOGO_HEIGHT,
      filter: "FlateDecode",
    },
  ];
  let nextId = 6;
  const employee = input.signature ? jpegSize(input.signature) : null;
  if (input.signature && employee) {
    images.push({
      key: "employee",
      objectId: nextId,
      bytes: input.signature,
      width: employee.width,
      height: employee.height,
      filter: "DCTDecode",
    });
    nextId += 1;
  }
  const customer = input.customerSignature ? jpegSize(input.customerSignature) : null;
  if (input.customerSignature && customer) {
    images.push({
      key: "customer",
      objectId: nextId,
      bytes: input.customerSignature,
      width: customer.width,
      height: customer.height,
      filter: "DCTDecode",
    });
  }
  const stream = layout(input, images);
  return serialize(stream, images);
}

function layout(input: TimesheetPdfInput, images: PdfImage[]): string {
  const ops: string[] = [];
  const logoH = (LOGO_W * OFFER_LOGO_HEIGHT) / OFFER_LOGO_WIDTH;
  const logoBottom = PAGE_H - 28 - logoH;
  let y = logoBottom - 28;
  const paint = (command: string) => ops.push(command);
  const textAt = (x: number, baseline: number, size: number, font: "F1" | "F2", value: string, color = "0.15 0.15 0.15") => {
    const shown = value.trim();
    if (!shown) return;
    paint(`${color} rg /${font} ${size} Tf BT 1 0 0 1 ${round(x)} ${round(baseline)} Tm ${pdfText(shown)} Tj ET`);
  };
  const textRight = (right: number, baseline: number, size: number, font: "F1" | "F2", value: string, color = "0.15 0.15 0.15") => {
    const width = textWidth(value, size, font === "F2");
    textAt(right - width, baseline, size, font, value, color);
  };
  const line = (value: string, size = 11, font: "F1" | "F2" = "F1") => {
    for (const part of wrap(value, 92)) {
      textAt(LEFT, y, size, font, part);
      y -= size + 4;
    }
  };

  paint(`q ${round(LOGO_W)} 0 0 ${round(logoH)} ${LEFT} ${round(logoBottom)} cm /Im5 Do Q`);
  textRight(RIGHT, PAGE_H - 44, 18, "F2", "Stundenzettel", "0 0 0");
  textRight(RIGHT, PAGE_H - 62, 10, "F1", input.number, "0.4 0.4 0.4");
  textRight(RIGHT, PAGE_H - 76, 9, "F1", input.dateLabel, "0.4 0.4 0.4");
  paint("0 0 0 rg");
  paint(`0 ${round(logoBottom - 12)} ${PAGE_W} 2 re f`);

  line(input.customerName, 13, "F2");
  const place = [input.street, [input.postalCode, input.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (place) line(place, 11);
  line(`Mitarbeiter: ${input.employeeName}`, 11);
  line(`Arbeitstag: ${formatOfferDate(input.workDate)}`, 11);
  y -= 8;

  paint(`0 0 0 rg ${LEFT} ${round(y - 4)} ${RIGHT - LEFT} 16 re f`);
  textAt(LEFT + 4, y, 8, "F2", "Beginn", "1 1 1");
  textAt(LEFT + 58, y, 8, "F2", "Ende", "1 1 1");
  textAt(LEFT + 108, y, 8, "F2", "Pause", "1 1 1");
  textAt(LEFT + 160, y, 8, "F2", "Stunden", "1 1 1");
  textAt(LEFT + 220, y, 8, "F2", "Tätigkeit", "1 1 1");
  y -= 20;

  input.lines.forEach((row, index) => {
    const minutes = netMinutes(row.start, row.end, row.breakMinutes) ?? 0;
    if (index % 2 === 0) {
      paint(`0.94 0.94 0.94 rg ${LEFT} ${round(y - 4)} ${RIGHT - LEFT} 16 re f`);
    }
    textAt(LEFT + 4, y, 9, "F1", row.start);
    textAt(LEFT + 58, y, 9, "F1", row.end);
    textAt(LEFT + 108, y, 9, "F1", row.breakMinutes ? `${row.breakMinutes} Min.` : "–");
    textAt(LEFT + 160, y, 9, "F1", formatDecimalHours(minutes));
    textAt(LEFT + 220, y, 9, "F1", row.task.slice(0, 42));
    y -= 18;
  });
  y -= 8;
  line(`Summe ${formatMinutes(input.totalMinutes)} (${formatDecimalHours(input.totalMinutes)} Std.)`, 12, "F2");
  if (input.note) {
    y -= 6;
    line(input.note, 10);
  }
  y -= 8;
  line(TIMESHEET_SIGN_NOTE, 9);
  if (input.contentHash) line(`Prüfwert: ${input.contentHash}`, 8);
  if (input.signedAtLabel) line(`Festgeschrieben am ${input.signedAtLabel}.`, 10, "F2");
  y -= 12;

  const drawSign = (title: string, person: string, image: PdfImage | null) => {
    line(title, 11, "F2");
    line(person || "keine Unterschrift", 10);
    if (image) {
      const boxW = 220;
      const boxH = Math.min(70, (boxW * image.height) / image.width);
      y -= boxH;
      paint(`q ${round(boxW)} 0 0 ${round(boxH)} ${LEFT} ${round(y)} cm /Im${image.objectId} Do Q`);
      y -= 12;
    }
    y -= 8;
  };
  drawSign("Unterschrift Mitarbeiter", input.signerName, images.find((image) => image.key === "employee") ?? null);
  drawSign("Unterschrift Auftraggeber", input.customerSignerName, images.find((image) => image.key === "customer") ?? null);
  return ops.join("\n");
}

function serialize(stream: string, images: PdfImage[]): Uint8Array {
  const xobjects = images.map((image) => `/Im${image.objectId} ${image.objectId} 0 R`).join(" ");
  const contentId = Math.max(...images.map((image) => image.objectId)) + 1;
  const pageId = contentId + 1;
  const objects = new Map<number, Uint8Array>();
  objects.set(1, latin1("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.set(2, latin1(`<< /Type /Pages /Count 1 /Kids [${pageId} 0 R] >>`));
  objects.set(3, latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  objects.set(4, latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  for (const image of images) {
    objects.set(
      image.objectId,
      concat([
        latin1(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${image.filter} /Length ${image.bytes.length} >>\nstream\n`,
        ),
        image.bytes,
        latin1("\nendstream"),
      ]),
    );
  }
  objects.set(contentId, latin1(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`));
  objects.set(
    pageId,
    latin1(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobjects} >> >> >>`,
    ),
  );
  const count = pageId;
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

function wrap(value: string, max: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
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
  const table = bold ? HELVETICA_BOLD : HELVETICA;
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
  "–": 0x96,
  "—": 0x97,
  "„": 0x84,
  "“": 0x93,
  "”": 0x94,
  "ü": 0xfc,
  "ö": 0xf6,
  "ä": 0xe4,
  "ß": 0xdf,
  "Ü": 0xdc,
  "Ö": 0xd6,
  "Ä": 0xc4,
};

const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 222, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  222, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 500,
  556, 500, 278, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 500, 611, 500,
  500, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 500, 500, 667,
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 278, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  278, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 500,
  556, 500, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 500, 611, 500,
  500, 278, 278, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 500, 500, 667,
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333,
  400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611,
  722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278,
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611,
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 556, 611, 556,
];
