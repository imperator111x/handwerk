/** Gerätename aus dem Browser, zum Beispiel „iPhone · Safari“. */
export function passkeyDeviceLabel(userAgent: string): string {
  const ua = userAgent.slice(0, 400);
  let device = "Unbekanntes Gerät";
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) device = "iPad";
  else if (/iPhone|iPod/i.test(ua)) device = "iPhone";
  else if (/Android/i.test(ua) && /Mobile/i.test(ua)) device = "Android-Telefon";
  else if (/Android/i.test(ua)) device = "Android-Tablet";
  else if (/Windows/i.test(ua)) device = "Windows-PC";
  else if (/Macintosh|Mac OS/i.test(ua)) device = "Mac";
  else if (/CrOS/i.test(ua)) device = "Chromebook";
  else if (/Linux/i.test(ua)) device = "Linux-PC";

  let browser = "";
  if (/Edg\/|EdgiOS/i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/FxiOS|Firefox\//i.test(ua)) browser = "Firefox";
  else if (/CriOS|Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  return browser ? `${device} · ${browser}` : device;
}
