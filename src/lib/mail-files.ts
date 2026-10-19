// Cloudflare Email Sending begrenzt die ganze Nachricht auf 5 MiB.
// Base64 vergrößert Anhänge um ein Drittel, das Logo und der HTML-Rahmen
// brauchen ebenfalls Platz. 3 MB Rohdaten bleiben darunter.
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
export const MAX_FILES = 6;

export interface PreparedUpload {
  filename: string;
  type: string;
  bytes: Uint8Array;
  kind: "image" | "document";
  uploadId?: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

export function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "datei";
  const clean = base.replace(/[^\w.\- ()äöüÄÖÜß]+/g, "_").replace(/^\.+/, "").slice(0, 80);
  return clean || "datei";
}

function matchesMagic(type: string, extension: string, bytes: Uint8Array): boolean {
  if (type === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (type === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
  if (type === "image/gif") return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
  if (type === "image/webp") {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes.length > 12 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  if (type === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  if (type === "text/plain") {
    return extension === "txt" && !bytes.slice(0, 1024).includes(0);
  }
  if (type === "application/msword" || type === "application/vnd.ms-excel") {
    return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]);
  }
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  }
  return false;
}

function typeFor(filename: string, declared: string): { type: string; kind: "image" | "document" } | null {
  const extension = extensionOf(filename);
  const byExtension: Record<string, { type: string; kind: "image" | "document" }> = {
    jpg: { type: "image/jpeg", kind: "image" },
    jpeg: { type: "image/jpeg", kind: "image" },
    png: { type: "image/png", kind: "image" },
    gif: { type: "image/gif", kind: "image" },
    webp: { type: "image/webp", kind: "image" },
    pdf: { type: "application/pdf", kind: "document" },
    doc: { type: "application/msword", kind: "document" },
    docx: {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      kind: "document",
    },
    xls: { type: "application/vnd.ms-excel", kind: "document" },
    xlsx: {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      kind: "document",
    },
    txt: { type: "text/plain", kind: "document" },
  };
  const fromName = byExtension[extension];
  if (!fromName) return null;
  const declaredType = declared.toLowerCase().split(";")[0].trim();
  if (declaredType && declaredType !== "application/octet-stream" && declaredType !== fromName.type) {
    return null;
  }
  if (fromName.kind === "image" && !IMAGE_TYPES.has(fromName.type)) return null;
  if (fromName.kind === "document" && !DOCUMENT_TYPES.has(fromName.type)) return null;
  return fromName;
}

export function inspectUpload(
  filename: string,
  declaredType: string,
  bytes: Uint8Array,
  uploadId?: string,
): PreparedUpload | null {
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_FILE_BYTES) return null;
  const safeName = safeFilename(filename);
  const typed = typeFor(safeName, declaredType);
  if (!typed || !matchesMagic(typed.type, extensionOf(safeName), bytes)) return null;
  if (uploadId !== undefined && !/^[a-z0-9]{4,32}$/i.test(uploadId)) return null;
  return {
    filename: safeName,
    type: typed.type,
    bytes,
    kind: typed.kind,
    uploadId,
  };
}

/** Bilddateien heißen `{uploadId}--{dateiname}`. Getrennt wird am ersten `--`. */
export function imageNameParts(name: string): { uploadId: string; filename: string } | null {
  const sep = name.indexOf("--");
  if (sep < 4 || sep > 32) return null;
  const uploadId = name.slice(0, sep);
  const filename = name.slice(sep + 2);
  if (!/^[a-z0-9]{4,32}$/i.test(uploadId) || !filename) return null;
  return { uploadId, filename };
}

export async function readFormUploads(
  entries: FormDataEntryValue[],
  kind: "image" | "document",
): Promise<PreparedUpload[] | null> {
  const files = entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const prepared: PreparedUpload[] = [];
  for (const file of files) {
    const named = kind === "image" ? imageNameParts(file.name) : null;
    if (kind === "image" && !named) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const inspected = inspectUpload(
      named?.filename ?? file.name,
      file.type,
      bytes,
      named?.uploadId,
    );
    if (!inspected || inspected.kind !== kind) return null;
    prepared.push(inspected);
  }
  return prepared;
}
