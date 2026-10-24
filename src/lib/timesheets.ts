import { buildTimesheetPdf, type TimesheetPdfInput } from "./timesheet-pdf";
import {
  readTimesheetLines,
  timesheetContentHash,
  timesheetNumber,
  type ParsedTimesheet,
  type TimesheetContent,
} from "./timesheet";
import { formatBerlinDate, formatOfferDate } from "./quote";
import { formatBerlin } from "./time";

export interface TimesheetRow {
  id: number;
  customer_id: number | null;
  customer_name: string;
  street: string;
  postal_code: string;
  city: string;
  employee_name: string;
  work_date: string;
  lines_json: string;
  note: string;
  total_minutes: number;
  content_hash: string | null;
  signed_at: number | null;
  signer_name: string;
  signature_jpeg: string;
  customer_signer_name: string;
  customer_signature_jpeg: string;
  created_at: number;
  user_id: number | null;
}

export function timesheetContent(row: TimesheetRow): TimesheetContent {
  return {
    customerName: row.customer_name,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    employeeName: row.employee_name,
    workDate: row.work_date,
    note: row.note,
    lines: readTimesheetLines(row.lines_json),
  };
}

export async function listTimesheets(db: D1Database): Promise<TimesheetRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, customer_id, customer_name, street, postal_code, city, employee_name, work_date,
              lines_json, note, total_minutes, content_hash, signed_at, signer_name, signature_jpeg,
              customer_signer_name, customer_signature_jpeg, created_at, user_id
         FROM timesheets
        ORDER BY work_date DESC, id DESC`,
    )
    .all<TimesheetRow>();
  return results ?? [];
}

export async function getTimesheet(db: D1Database, id: number): Promise<TimesheetRow | null> {
  return await db
    .prepare(
      `SELECT id, customer_id, customer_name, street, postal_code, city, employee_name, work_date,
              lines_json, note, total_minutes, content_hash, signed_at, signer_name, signature_jpeg,
              customer_signer_name, customer_signature_jpeg, created_at, user_id
         FROM timesheets WHERE id = ?`,
    )
    .bind(id)
    .first<TimesheetRow>();
}

export async function insertTimesheet(
  db: D1Database,
  input: ParsedTimesheet & { customerId: number | null; userId: number | null },
): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO timesheets (
         customer_id, customer_name, street, postal_code, city, employee_name, work_date,
         lines_json, note, total_minutes, user_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.customerId,
      input.customerName,
      input.street,
      input.postalCode,
      input.city,
      input.employeeName,
      input.workDate,
      JSON.stringify(input.lines),
      input.note,
      input.totalMinutes,
      input.userId,
    )
    .run();
  return Number(result.meta.last_row_id ?? 0);
}

export async function updateTimesheet(db: D1Database, id: number, input: ParsedTimesheet & { customerId: number | null }): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE timesheets
          SET customer_id = ?, customer_name = ?, street = ?, postal_code = ?, city = ?,
              employee_name = ?, work_date = ?, lines_json = ?, note = ?, total_minutes = ?
        WHERE id = ? AND signed_at IS NULL`,
    )
    .bind(
      input.customerId,
      input.customerName,
      input.street,
      input.postalCode,
      input.city,
      input.employeeName,
      input.workDate,
      JSON.stringify(input.lines),
      input.note,
      input.totalMinutes,
      id,
    )
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function signTimesheet(
  db: D1Database,
  id: number,
  signature: {
    hash: string;
    signedAt: number;
    signerName: string;
    signatureJpeg: string;
    customerSignerName: string;
    customerSignatureJpeg: string;
  },
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE timesheets
          SET content_hash = ?, signed_at = ?, signer_name = ?, signature_jpeg = ?,
              customer_signer_name = ?, customer_signature_jpeg = ?
        WHERE id = ? AND signed_at IS NULL`,
    )
    .bind(
      signature.hash,
      signature.signedAt,
      signature.signerName,
      signature.signatureJpeg,
      signature.customerSignerName,
      signature.customerSignatureJpeg,
      id,
    )
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function deleteTimesheet(db: D1Database, id: number): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM timesheets WHERE id = ? AND signed_at IS NULL`)
    .bind(id)
    .run();
  return Number(result.meta.changes ?? 0) > 0;
}

export async function timesheetPdf(row: TimesheetRow): Promise<{ filename: string; bytes: Uint8Array }> {
  const content = timesheetContent(row);
  const hash = row.content_hash || (row.signed_at ? await timesheetContentHash(content) : null);
  const employee = row.signature_jpeg ? decodeStoredJpeg(row.signature_jpeg) : null;
  const customer = row.customer_signature_jpeg ? decodeStoredJpeg(row.customer_signature_jpeg) : null;
  const number = timesheetNumber(row.id, row.created_at);
  const input: TimesheetPdfInput = {
    number: row.signed_at ? number : `${number} Entwurf`,
    dateLabel: formatBerlinDate(row.created_at),
    customerName: content.customerName,
    street: content.street,
    postalCode: content.postalCode,
    city: content.city,
    employeeName: content.employeeName,
    workDate: content.workDate,
    note: content.note,
    lines: content.lines,
    totalMinutes: row.total_minutes,
    contentHash: hash,
    signedAtLabel: row.signed_at ? formatBerlin(row.signed_at) : null,
    signerName: row.signer_name,
    signature: employee,
    customerSignerName: row.customer_signer_name,
    customerSignature: customer,
  };
  return { filename: `Stundenzettel-${number}.pdf`, bytes: buildTimesheetPdf(input) };
}

function decodeStoredJpeg(raw: string): Uint8Array | null {
  if (!raw) return null;
  try {
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export function workDateLabel(iso: string): string {
  return formatOfferDate(iso);
}
