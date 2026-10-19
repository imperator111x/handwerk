export const HUMAN_COOKIE = "zs_human";
export const HUMAN_MAX_AGE = 60 * 60 * 12;

function passSecret(env: Env | undefined): string | undefined {
  return env?.TURNSTILE_PAGE_SECRET || env?.SESSION_SECRET;
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createHumanPass(env: Env | undefined): Promise<string | null> {
  const secret = passSecret(env);
  if (!secret) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + HUMAN_MAX_AGE;
  const signature = await hmac(secret, `human:${expiresAt}`);
  return `${expiresAt}.${signature}`;
}

export async function humanPassValid(token: string | undefined, env: Env | undefined): Promise<boolean> {
  const secret = passSecret(env);
  if (!token || !secret) return false;
  const [expiresRaw, signature] = token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || !signature || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(secret, `human:${expiresAt}`);
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}
