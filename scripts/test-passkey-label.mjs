import assert from "node:assert/strict";
import { passkeyDeviceLabel } from "../src/lib/passkey-label.ts";

assert.equal(
  passkeyDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15"),
  "iPhone",
);
assert.equal(
  passkeyDeviceLabel("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15"),
  "iPad",
);
assert.equal(
  passkeyDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
  "iPad",
);
assert.equal(passkeyDeviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8)"), "Android");
assert.equal(passkeyDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "Mac");
assert.equal(passkeyDeviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "Windows");
assert.equal(passkeyDeviceLabel("Mozilla/5.0 (X11; Linux x86_64)"), "Linux");
assert.equal(passkeyDeviceLabel(""), "Unbekanntes Gerät");

console.log("passkey label checks ok");
