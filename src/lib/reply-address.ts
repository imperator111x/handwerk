/**
 * Signierte Antwortadresse pro Anfrage.
 *
 * Format: r+<id>.<sig>@<domain>
 * Die Signatur ist ein HMAC über die Anfrage-ID, damit niemand durch
 * Raten einer ID fremde Verläufe beschreiben kann.
 */

export const DEFAULT_REPLY_DOMAIN = "zeus-service.de";

const TOKEN_RE = /^r\+(\d+)\.([a-f0-9]{16})$/i;

export async function buildReplyAddress(
  secret: string,
  requestId: number,
  domain: string,
): Promise<string | null> {
  if (!secret || !domain || !Number.isInteger(requestId) || requestId <= 0) {
    return null;
  }
  const sig = await signRequestId(secret, requestId);
  return `r+${requestId}.${sig}@${domain.replace(/^@/, "")}`;
}

export async function verifyReplyToken(
  secret: string,
  requestId: number,
  signature: string,
): Promise<boolean> {
  if (!secret || !Number.isInteger(requestId) || requestId <= 0) return false;
  const expected = await signRequestId(secret, requestId);
  return safeEqual(expected, signature.toLowerCase());
}

export function parseReplyToken(
  address: string,
): { requestId: number; signature: string } | null {
  const local = address.trim().toLowerCase().replace(/^.*</, "").replace(/>.*$/, "");
  const at = local.lastIndexOf("@");
  const mailbox = at >= 0 ? local.slice(0, at) : local;
  const match = TOKEN_RE.exec(mailbox);
  if (!match) return null;
  return { requestId: Number.parseInt(match[1], 10), signature: match[2].toLowerCase() };
}

export function collectAddresses(values: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    for (const part of value.split(/[,\s]+/)) {
      const cleaned = part.replace(/[<>"']/g, "").trim().toLowerCase();
      if (cleaned.includes("@")) found.add(cleaned);
    }
  }
  return [...found];
}

export function extractMessageIds(header: string | null | undefined): string[] {
  if (!header) return [];
  const bracketed = [...header.matchAll(/<([^<>\s]+)>/g)].map((match) => match[1]);
  if (bracketed.length > 0) return [...new Set(bracketed)];
  const bare = header.trim();
  return bare ? [bare] : [];
}

export function normalizeMessageId(value: string | null | undefined): string | null {
  const ids = extractMessageIds(value);
  const bare = ids[0]?.trim().replace(/^<|>$/g, "") ?? "";
  if (!bare || /[\r\n]/.test(bare)) return null;
  return bare;
}

export function formatMessageIdHeader(value: string | null | undefined): string | null {
  const bare = normalizeMessageId(value);
  return bare ? `<${bare}>` : null;
}

async function signRequestId(secret: string, requestId: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`reply:${requestId}`),
  );
  return [...new Uint8Array(signature)]
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}
