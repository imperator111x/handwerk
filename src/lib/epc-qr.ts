import { encode } from "uqr";

/** EPC069-12 / GiroCode-Payload für SEPA-Überweisung. */
export function buildEpcPaymentPayload(input: {
  name: string;
  iban: string;
  bic: string;
  amountCents: number;
  remittance: string;
}): string | null {
  if (!Number.isInteger(input.amountCents) || input.amountCents < 1 || input.amountCents > 99_999_999_99) {
    return null;
  }
  const name = input.name.trim().slice(0, 70);
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  const bic = input.bic.replace(/\s+/g, "").toUpperCase();
  if (!name || !/^DE\d{20}$/.test(iban)) return null;
  const euros = (input.amountCents / 100).toFixed(2);
  const remittance = input.remittance.replace(/\s+/g, " ").trim().slice(0, 140);
  if (!remittance) return null;
  // Version 002, Zeichensatz 1 (UTF-8), Service SCT.
  return [
    "BCD",
    "002",
    "1",
    "SCT",
    bic,
    name,
    iban,
    `EUR${euros}`,
    "", // Purpose
    "", // Structured remittance
    remittance,
  ].join("\n");
}

export interface QrPdfImage {
  width: number;
  height: number;
  bytes: Uint8Array;
}

/** 1-Bit DeviceGray-Bitmap für PDF (unkomprimiert, schwarz = 1). */
export function epcQrPdfImage(payload: string, modulePx = 3, quietModules = 4): QrPdfImage | null {
  const encoded = encode(payload, { ecc: "M", border: quietModules });
  const size = encoded.size;
  if (!size || !encoded.data?.length) return null;
  const width = size * modulePx;
  const height = width;
  const rowBytes = Math.ceil(width / 8);
  // DeviceGray: 0 = schwarz, 1 = weiß → alles weiß, dunkle Module auf 0.
  const bytes = new Uint8Array(rowBytes * height).fill(0xff);
  for (let y = 0; y < size; y += 1) {
    const row = encoded.data[y];
    if (!row) continue;
    for (let x = 0; x < size; x += 1) {
      if (!row[x]) continue;
      for (let dy = 0; dy < modulePx; dy += 1) {
        const py = y * modulePx + dy;
        for (let dx = 0; dx < modulePx; dx += 1) {
          const px = x * modulePx + dx;
          const index = py * rowBytes + (px >> 3);
          bytes[index] &= ~(0x80 >> (px & 7));
        }
      }
    }
  }
  return { width, height, bytes };
}

export function buildInvoicePaymentQr(input: {
  name: string;
  iban: string;
  bic: string;
  amountCents: number;
  remittance: string;
}): QrPdfImage | null {
  const payload = buildEpcPaymentPayload(input);
  if (!payload) return null;
  return epcQrPdfImage(payload);
}
