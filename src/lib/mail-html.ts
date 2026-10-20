import { decodeHtmlEntities } from "./html-entities";

const ALLOWED = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "blockquote",
]);

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readAttrs(raw: string): Map<string, string> {
  const attrs = new Map<string, string>();
  const pattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of raw.matchAll(pattern)) {
    attrs.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function safeHref(value: string): string | null {
  const href = value.trim();
  if (/^https:\/\/[^\s<>"]+$/i.test(href)) return href;
  if (/^mailto:[^\s<>"]+$/i.test(href)) return href;
  return null;
}

function safeCid(value: string): string | null {
  const src = value.trim();
  if (/^cid:[a-z0-9-]{1,64}$/i.test(src)) return src;
  return null;
}

function safeTag(name: string, attrs: string, closing: boolean): string {
  if (!ALLOWED.has(name)) return "";
  if (closing) return name === "br" ? "" : `</${name}>`;
  if (name === "br") return "<br>";
  if (name === "a") {
    const href = safeHref(readAttrs(attrs).get("href") ?? "");
    return href ? `<a href="${escapeAttr(href)}">` : "<a>";
  }
  if (name === "img") {
    const src = safeCid(readAttrs(attrs).get("src") ?? "");
    if (!src) return "";
    const alt = (readAttrs(attrs).get("alt") ?? "").slice(0, 120);
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`;
  }
  return `<${name}>`;
}

/** Erlaubt nur die Formatierung, die der Antwort-Editor erzeugt. */
export function sanitizeMailHtml(input: string): string {
  const withoutDanger = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?\s*>/gi, "");
  return withoutDanger.replace(/<\/?\s*([a-zA-Z0-9]+)([^>]*)>/g, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    return safeTag(name, attrs, full.trim().startsWith("</"));
  });
}

export function htmlToPlainText(input: string): string {
  const withBreaks = input
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|blockquote|h\d|ul|ol)>/gi, "\n");
  const stripped = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ""));
  return stripped.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function replaceEditorImages(
  html: string,
  images: Map<string, { cid: string; filename: string }>,
  mode: "email" | "store",
): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const id = /data-upload-id=["']([a-z0-9]{4,32})["']/i.exec(tag)?.[1];
    const image = id ? images.get(id) : undefined;
    if (!image) return "";
    if (mode === "store") return `<p>Bild: ${escapeAttr(image.filename)}</p>`;
    return `<img src="cid:${image.cid}" alt="${escapeAttr(image.filename)}">`;
  });
}
