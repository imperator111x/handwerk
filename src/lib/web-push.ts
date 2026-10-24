const textEncoder = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function bytesFromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", bufferOf(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: bufferOf(salt), info: bufferOf(info) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

export interface PushEncryptionInput {
  userPublicKey: Uint8Array;
  userAuth: Uint8Array;
  payload: Uint8Array;
  asPublicKey: Uint8Array;
  asPrivateKey: CryptoKey;
  salt: Uint8Array;
}

export async function encryptPushPayload(input: PushEncryptionInput): Promise<Uint8Array> {
  const userKey = await crypto.subtle.importKey(
    "raw",
    bufferOf(input.userPublicKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: userKey }, input.asPrivateKey, 256),
  );
  const keyInfo = concat([
    textEncoder.encode("WebPush: info\0"),
    input.userPublicKey,
    input.asPublicKey,
  ]);
  const ikm = await hkdf(input.userAuth, shared, keyInfo, 32);
  const cek = await hkdf(input.salt, ikm, textEncoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(input.salt, ikm, textEncoder.encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", bufferOf(cek), "AES-GCM", false, ["encrypt"]);
  const record = concat([input.payload, new Uint8Array([2])]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: bufferOf(nonce) }, aesKey, bufferOf(record)),
  );
  const header = new Uint8Array(21 + input.asPublicKey.byteLength);
  header.set(input.salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = input.asPublicKey.byteLength;
  header.set(input.asPublicKey, 21);
  return concat([header, ciphertext]);
}

export async function generatePushKeys(): Promise<{ publicKey: Uint8Array; privateKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey, privateKey: pair.privateKey };
}

export function pushEndpointAllowed(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  const allowed = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "notify.windows.com"];
  return allowed.some((item) => host === item || host.endsWith(`.${item}`));
}

export async function signVapidJwt(privateJwk: JsonWebKey, audience: string, subject: string): Promise<{ jwt: string; publicKey: string }> {
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", key);
  if (!publicJwk.x || !publicJwk.y) throw new Error("vapid_public_missing");
  const x = bytesFromBase64Url(publicJwk.x);
  const y = bytesFromBase64Url(publicJwk.y);
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(x, 1);
  raw.set(y, 33);
  const header = bytesToBase64Url(textEncoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToBase64Url(
    textEncoder.encode(JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    })),
  );
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textEncoder.encode(unsigned)),
  );
  return { jwt: `${unsigned}.${bytesToBase64Url(signature)}`, publicKey: bytesToBase64Url(raw) };
}

export async function sendWebPush(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: string;
  privateJwk: JsonWebKey;
  subject: string;
}): Promise<number> {
  const endpoint = new URL(input.endpoint);
  const vapid = await signVapidJwt(input.privateJwk, endpoint.origin, input.subject);
  const keys = await generatePushKeys();
  const body = await encryptPushPayload({
    userPublicKey: bytesFromBase64Url(input.p256dh),
    userAuth: bytesFromBase64Url(input.auth),
    payload: textEncoder.encode(input.payload),
    asPublicKey: keys.publicKey,
    asPrivateKey: keys.privateKey,
    salt: crypto.getRandomValues(new Uint8Array(16)),
  });
  const response = await fetch(input.endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      Urgency: "high",
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      Authorization: `vapid t=${vapid.jwt},k=${vapid.publicKey}`,
    },
    body: bufferOf(body),
  });
  return response.status;
}
