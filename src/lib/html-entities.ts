const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "ä",
  Auml: "Ä",
  ouml: "ö",
  Ouml: "Ö",
  uuml: "ü",
  Uuml: "Ü",
  szlig: "ß",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bull: "•",
  middot: "·",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  sup2: "²",
  sup3: "³",
  micro: "µ",
  shy: "\u00ad",
  ensp: " ",
  emsp: " ",
  thinsp: "\u2009",
  para: "¶",
  sect: "§",
  plusmn: "±",
  times: "×",
  divide: "÷",
  frac14: "¼",
  frac12: "½",
  frac34: "¾",
  iexcl: "¡",
  iquest: "¿",
  acute: "´",
  cedil: "¸",
  agrave: "à",
  Agrave: "À",
  aacute: "á",
  Aacute: "Á",
  acirc: "â",
  Acirc: "Â",
  atilde: "ã",
  Atilde: "Ã",
  aring: "å",
  Aring: "Å",
  aelig: "æ",
  AElig: "Æ",
  ccedil: "ç",
  Ccedil: "Ç",
  egrave: "è",
  Egrave: "È",
  eacute: "é",
  Eacute: "É",
  ecirc: "ê",
  Ecirc: "Ê",
  euml: "ë",
  Euml: "Ë",
  igrave: "ì",
  Igrave: "Ì",
  iacute: "í",
  Iacute: "Í",
  icirc: "î",
  Icirc: "Î",
  iuml: "ï",
  Iuml: "Ï",
  ntilde: "ñ",
  Ntilde: "Ñ",
  ograve: "ò",
  Ograve: "Ò",
  oacute: "ó",
  Oacute: "Ó",
  ocirc: "ô",
  Ocirc: "Ô",
  otilde: "õ",
  Otilde: "Õ",
  oslash: "ø",
  Oslash: "Ø",
  ugrave: "ù",
  Ugrave: "Ù",
  uacute: "ú",
  Uacute: "Ú",
  ucirc: "û",
  Ucirc: "Û",
  yacute: "ý",
  Yacute: "Ý",
  yuml: "ÿ",
};

const CASE_VARIANTS = new Set(
  Object.keys(NAMED).filter((name) => name !== name.toLowerCase()).map((name) => name.toLowerCase()),
);

function namedChar(name: string): string | undefined {
  const exact = NAMED[name];
  if (exact) return exact;
  const lower = name.toLowerCase();
  if (lower === name || CASE_VARIANTS.has(lower)) return undefined;
  return NAMED[lower];
}

const ENTITY = /&(?:#x([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g;

function fromCodePoint(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return null;
  if (value >= 0xd800 && value <= 0xdfff) return null;
  if (value < 32 && value !== 9 && value !== 10 && value !== 13) return null;
  if (value === 0x7f) return null;
  return String.fromCodePoint(value);
}

/** Wandelt HTML-Zeichen wie `&uuml;` in echte Buchstaben um. Unbekannte Folgen bleiben stehen. */
export function decodeHtmlEntities(input: string): string {
  if (!input.includes("&")) return input;
  let value = input;
  for (let pass = 0; pass < 3; pass += 1) {
    if (!value.includes("&")) break;
    const next = value.replace(ENTITY, (full, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
      if (hex) return fromCodePoint(Number.parseInt(hex, 16)) ?? full;
      if (dec) return fromCodePoint(Number.parseInt(dec, 10)) ?? full;
      return (name ? namedChar(name) : undefined) ?? full;
    });
    if (next === value) break;
    value = next;
  }
  return value;
}
