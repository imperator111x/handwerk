const berlin = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

/** Unix-Sekunden als Datum und Uhrzeit in Deutschland. */
export function formatBerlin(unixSeconds: number): string {
  return berlin.format(new Date(unixSeconds * 1000));
}
