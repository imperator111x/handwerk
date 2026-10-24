export const SALUTATIONS = ["herr", "frau", "herren_damen", "hallo_vorname", "hallo_name"] as const;

export type Salutation = (typeof SALUTATIONS)[number];

export function splitPersonName(raw: string): { first: string; last: string; full: string } {
  const parts = raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return { first: "", last: "", full: "" };
  if (parts.length === 1) return { first: parts[0], last: parts[0], full: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" "), full: parts.join(" ") };
}

export function isSalutation(value: string): value is Salutation {
  return (SALUTATIONS as readonly string[]).includes(value);
}

/** Text in der Auswahl, ohne Komma. */
export function greetingChoices(rawName: string): Array<{ value: Salutation; label: string }> {
  const { first, last, full } = splitPersonName(rawName);
  return [
    { value: "herr", label: last ? `Sehr geehrter Herr ${last}` : "Sehr geehrter Herr …" },
    { value: "frau", label: last ? `Sehr geehrte Frau ${last}` : "Sehr geehrte Frau …" },
    { value: "herren_damen", label: "Sehr geehrte Herren und Damen" },
    { value: "hallo_vorname", label: first ? `Hallo ${first}` : "Hallo Vorname" },
    { value: "hallo_name", label: full ? `Hallo ${full}` : "Hallo Name" },
  ];
}

/** Zeile über dem Mailtext. Ohne Namen entfällt „Hallo“. */
export function greetingFor(kind: string, rawName: string): string | null {
  const choice: Salutation = isSalutation(kind) ? kind : "hallo_name";
  const { first, last, full } = splitPersonName(rawName);
  if (choice === "herr") return `Sehr geehrter Herr${last ? ` ${last}` : ""},`;
  if (choice === "frau") return `Sehr geehrte Frau${last ? ` ${last}` : ""},`;
  if (choice === "herren_damen") return "Sehr geehrte Herren und Damen,";
  if (choice === "hallo_vorname") return first ? `Hallo ${first},` : null;
  return full ? `Hallo ${full},` : null;
}

export function greetingFromForm(form: FormData, rawName: string): string | null {
  return greetingFor(String(form.get("salutation") ?? ""), rawName);
}

export function salutationFromGreeting(greeting: string | null, rawName: string): Salutation {
  if (!greeting) return "hallo_name";
  for (const kind of SALUTATIONS) {
    if (greetingFor(kind, rawName) === greeting) return kind;
  }
  return "hallo_name";
}
