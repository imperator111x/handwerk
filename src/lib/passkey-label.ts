/** Kurzer Gerätename aus dem Browser, damit Face-ID-Geräte unterscheidbar sind. */
export function passkeyDeviceLabel(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone")) return "iPhone";
  if (ua.includes("ipad") || (ua.includes("macintosh") && ua.includes("mobile"))) return "iPad";
  if (ua.includes("android")) return "Android";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "Mac";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("linux")) return "Linux";
  return "Unbekanntes Gerät";
}
