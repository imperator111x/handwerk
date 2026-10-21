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

export function buildTimesheetPdf(input: TimesheetPdfInput): Uint8Array {
  const employee = input.signature ? jpegSize(input.signature) : null;
  const customer = input.customerSignature ? jpegSize(input.customerSignature) : null;
  const images: Array<{ id: number; bytes: Uint8Array; width: number; height: number }> = [];
  if (input.signature && employee) images.push({ id: 5, bytes: input.signature, width: employee.width, height: employee.height });
  if (input.customerSignature && customer) {
    images.push({ id: images.length ? 6 : 5, bytes: input.customerSignature, width: customer.width, height: customer.height });
  }
  const stream = layout(input, images);
  return serialize(stream, images);
}

function layout(
  input: TimesheetPdfInput,
  images: Array<{ id: number; bytes: Uint8Array; width: number; height: number }>,
): string {
  const ops: string[] = [];
  let y = 780;
  const paint = (command: string) => ops.push(command);
  const textAt = (x: number, baseline: number, size: number, font: "F1" | "F2", value: string, color = "0 0 0") => {
    const shown = value.trim();
    if (!shown) return;
    paint(`${color} rg /${font} ${size} Tf BT 1 0 0 1 ${round(x)} ${round(baseline)} Tm ${pdfText(shown)} Tj ET`);
  };
  const line = (value: string, size = 11, font: "F1" | "F2" = "F1") => {
    for (const part of wrap(value, 92)) {
      textAt(LEFT, y, size, font, part);
      y -= size + 4;
    }
  };

  textAt(LEFT, y, 18, "F2", "Zeus-Service");
  textAt(RIGHT - 150, y, 11, "F2", input.number);
  y -= 16;
  textAt(LEFT, y, 10, "F1", "Stundenzettel");
  textAt(RIGHT - 150, y, 10, "F1", input.dateLabel);
  y -= 22;
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

  const drawSign = (title: string, person: string, image: { id: number; width: number; height: number } | null) => {
    line(title, 11, "F2");
    line(person || "keine Unterschrift", 10);
    if (image) {
      const boxW = 220;
      const boxH = Math.min(70, (boxW * image.height) / image.width);
      y -= boxH;
      paint(`q ${round(boxW)} 0 0 ${round(boxH)} ${LEFT} ${round(y)} cm /Im${image.id} Do Q`);
      y -= 12;
    }
    y -= 8;
  };
  const employeeImage = images.find((image) => input.signature && image.bytes === input.signature) ?? null;
  const customerImage = images.find((image) => input.customerSignature && image.bytes === input.customerSignature) ?? null;
  drawSign("Unterschrift Mitarbeiter", input.signerName, employeeImage);
  drawSign("Unterschrift Auftraggeber", input.customerSignerName, customerImage);
  return ops.join("\n");
}

function serialize(
  stream: string,
  images: Array<{ id: number; bytes: Uint8Array; width: number; height: number }>,
): Uint8Array {
  const xobjects = images.map((image) => `/Im${image.id} ${image.id} 0 R`).join(" ");
  const contentId = images.length ? Math.max(...images.map((image) => image.id)) + 1 : 5;
  const pageId = contentId + 1;
  const objects = new Map<number, Uint8Array>();
  objects.set(1, latin1("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.set(2, latin1(`<< /Type /Pages /Count 1 /Kids [${pageId} 0 R] >>`));
  objects.set(3, latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  objects.set(4, latin1("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  for (const image of images) {
    objects.set(
      image.id,
      concat([
        latin1(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
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
