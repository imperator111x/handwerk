import assert from "node:assert/strict";
import { passkeyDeviceLabel } from "../src/lib/passkey-label.ts";

assert.equal(
  passkeyDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
  "iPhone · Safari",
);
assert.equal(
  passkeyDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1"),
  "iPhone · Chrome",
);
assert.equal(
  passkeyDeviceLabel("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
  "iPad · Safari",
);
assert.equal(
  passkeyDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
  "iPad · Safari",
);
assert.equal(passkeyDeviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"), "Android-Telefon · Chrome");
assert.equal(passkeyDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"), "Mac · Chrome");
assert.equal(passkeyDeviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"), "Windows-PC · Edge");
assert.equal(passkeyDeviceLabel("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"), "Linux-PC · Chrome");
assert.equal(passkeyDeviceLabel(""), "Unbekanntes Gerät");

console.log("passkey label checks ok");
