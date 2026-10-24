import { offerYear } from "./quote";

export const MAX_TIMESHEET_LINES = 8;
export const TIMESHEET_SIGN_NOTE =
  "Die Unterschrift wurde auf diesem Gerät erfasst. Name, Zeitpunkt und der Prüfwert gehören zu diesem Stundenzettel. Danach ist der Inhalt festgeschrieben. Das ist eine einfache elektronische Signatur, keine qualifizierte Signatur mit Ausweis.";

export interface TimesheetLine {
  start: string;
  end: string;
  breakMinutes: number;
  task: string;
}

export interface TimesheetContent {
  customerName: string;
  street: string;
  postalCode: string;
  city: string;
  employeeName: string;
  workDate: string;
  note: string;
  lines: TimesheetLine[];
}

export interface ParsedTimesheet extends TimesheetContent {
  totalMinutes: number;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseClock(raw: string): number | null {
  const match = TIME.exec(raw.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function netMinutes(start: string, end: string, breakMinutes: number): number | null {
  const from = parseClock(start);
  const to = parseClock(end);
  if (from == null || to == null || to <= from) return null;
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) return null;
  const net = to - from - breakMinutes;
  if (net <= 0 || net > 16 * 60) return null;
  return net;
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} Std.`;
  return `${hours} Std. ${String(rest).padStart(2, "0")} Min.`;
}

export function formatDecimalHours(minutes: number): string {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minutes / 60);
}

export function timesheetNumber(id: number, unixSeconds: number): string {
  return `S-${offerYear(unixSeconds)}-${String(id).padStart(4, "0")}`;
}

export function parseTimesheetForm(form: FormData): ParsedTimesheet | null {
  const customerName = clean(String(form.get("customer_name") ?? ""), 120);
  const street = clean(String(form.get("street") ?? ""), 120);
  const postalCode = clean(String(form.get("postal_code") ?? ""), 12);
  const city = clean(String(form.get("city") ?? ""), 80);
  const employeeName = clean(String(form.get("employee_name") ?? ""), 80);
  const workDate = String(form.get("work_date") ?? "").trim();
  const note = clean(String(form.get("note") ?? ""), 500);
  if (
    customerName == null ||
    street == null ||
    postalCode == null ||
    city == null ||
    employeeName == null ||
    note == null
  ) return null;
  if (customerName.length < 2 || employeeName.length < 2) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;
  const starts = form.getAll("line_start").map((value) => String(value).trim());
  const ends = form.getAll("line_end").map((value) => String(value).trim());
  const breaks = form.getAll("line_break").map((value) => String(value).trim());
  const tasks = form.getAll("line_task").map((value) => String(value).trim());
  const count = Math.max(starts.length, ends.length, breaks.length, tasks.length);
  if (count < 1 || count > MAX_TIMESHEET_LINES) return null;
  const lines: TimesheetLine[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = starts[index] ?? "";
    const end = ends[index] ?? "";
    const taskRaw = tasks[index] ?? "";
    const breakRaw = breaks[index] ?? "";
    if (!start && !end && !taskRaw && !breakRaw) continue;
    const task = clean(taskRaw, 160);
    const breakMinutes = breakRaw === "" ? 0 : Number.parseInt(breakRaw, 10);
    if (!task || task.length < 2) return null;
    if (netMinutes(start, end, breakMinutes) == null) return null;
    lines.push({ start, end, breakMinutes, task });
  }
  if (lines.length < 1) return null;
  const totalMinutes = lines.reduce((sum, line) => sum + (netMinutes(line.start, line.end, line.breakMinutes) ?? 0), 0);
  if (totalMinutes <= 0) return null;
  return {
    customerName,
    street,
    postalCode,
    city,
    employeeName,
    workDate,
    note,
    lines,
    totalMinutes,
  };
}

function clean(value: string, max: number): string | null {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length > max) return null;
  return text;
}

export function timesheetCanonical(content: TimesheetContent): string {
  return JSON.stringify({
    customerName: content.customerName,
    street: content.street,
    postalCode: content.postalCode,
    city: content.city,
    employeeName: content.employeeName,
    workDate: content.workDate,
    note: content.note,
    lines: content.lines.map((line) => ({
      start: line.start,
      end: line.end,
      breakMinutes: line.breakMinutes,
      task: line.task,
    })),
  });
}

export async function timesheetContentHash(content: TimesheetContent): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(timesheetCanonical(content)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

export function decodeSignatureJpeg(raw: string): Uint8Array | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const payload = trimmed.startsWith("data:") ? trimmed.slice(trimmed.indexOf(",") + 1) : trimmed;
  if (!payload || payload.length > 220_000) return null;
  let binary = "";
  try {
    binary = atob(payload.replace(/\s/g, ""));
  } catch {
    return null;
  }
  if (binary.length < 100 || binary.length > 150_000) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  return bytes;
}

export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let index = 2;
  while (index + 8 < bytes.length) {
    if (bytes[index] !== 0xff) return null;
    const marker = bytes[index + 1] ?? 0;
    if (marker === 0xd8 || marker === 0xd9) {
      index += 2;
      continue;
    }
    const length = ((bytes[index + 2] ?? 0) << 8) + (bytes[index + 3] ?? 0);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xc2) {
      const height = ((bytes[index + 5] ?? 0) << 8) + (bytes[index + 6] ?? 0);
      const width = ((bytes[index + 7] ?? 0) << 8) + (bytes[index + 8] ?? 0);
      if (width < 20 || height < 20 || width > 4000 || height > 2500) return null;
      return { width, height };
    }
    index += 2 + length;
  }
  return null;
}

export function readTimesheetLines(raw: string): TimesheetLine[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const lines: TimesheetLine[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as { start?: unknown; end?: unknown; breakMinutes?: unknown; task?: unknown };
      const start = typeof row.start === "string" ? row.start : "";
      const end = typeof row.end === "string" ? row.end : "";
      const task = typeof row.task === "string" ? row.task : "";
      const breakMinutes = typeof row.breakMinutes === "number" ? row.breakMinutes : Number.NaN;
      if (netMinutes(start, end, breakMinutes) == null || task.trim().length < 2) continue;
      lines.push({ start, end, breakMinutes, task: task.trim() });
    }
    return lines;
  } catch {
    return [];
  }
}
