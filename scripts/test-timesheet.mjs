import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.(?:ts|js|mjs|json)$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const sheet = await import("../src/lib/timesheet.ts");
const { buildTimesheetPdf } = await import("../src/lib/timesheet-pdf.ts");

assert.equal(sheet.netMinutes("08:00", "12:30", 0), 270);
assert.equal(sheet.netMinutes("08:00", "16:00", 30), 450);
assert.equal(sheet.netMinutes("16:00", "08:00", 0), null);
assert.equal(sheet.formatMinutes(90), "1 Std. 30 Min.");
assert.equal(sheet.formatDecimalHours(90), "1,50");

const form = new FormData();
form.set("customer_name", "Erika Muster");
form.set("street", "Berliner Allee 44a");
form.set("postal_code", "22850");
form.set("city", "Norderstedt");
form.set("employee_name", "Leon Lütcke");
form.set("work_date", "2026-10-21");
form.set("note", "Garten");
form.append("line_start", "08:00");
form.append("line_end", "12:00");
form.append("line_break", "0");
form.append("line_task", "Hecke");
form.append("line_start", "13:00");
form.append("line_end", "16:00");
form.append("line_break", "15");
form.append("line_task", "Beete");
const parsed = sheet.parseTimesheetForm(form);
assert.ok(parsed);
assert.equal(parsed.totalMinutes, 4 * 60 + (3 * 60 - 15));
assert.equal(parsed.lines.length, 2);

const empty = new FormData();
empty.set("customer_name", "Erika Muster");
empty.set("employee_name", "Leon Lütcke");
empty.set("work_date", "2026-10-21");
empty.append("line_start", "");
empty.append("line_end", "");
empty.append("line_break", "");
empty.append("line_task", "");
assert.equal(sheet.parseTimesheetForm(empty), null);

const hashA = await sheet.timesheetContentHash(parsed);
const hashB = await sheet.timesheetContentHash({ ...parsed, note: "anders" });
assert.equal(hashA.length, 64);
assert.notEqual(hashA, hashB);

assert.equal(sheet.decodeSignatureJpeg("nope"), null);
assert.equal(sheet.timesheetNumber(4, Date.parse("2026-10-21T10:00:00Z") / 1000), "S-2026-0004");

const pdf = buildTimesheetPdf({
  number: "S-2026-0004",
  dateLabel: "21. Oktober 2026",
  customerName: parsed.customerName,
  street: parsed.street,
  postalCode: parsed.postalCode,
  city: parsed.city,
  employeeName: parsed.employeeName,
  workDate: parsed.workDate,
  note: parsed.note,
  lines: parsed.lines,
  totalMinutes: parsed.totalMinutes,
  contentHash: hashA,
  signedAtLabel: "21.10.2026, 12:00",
  signerName: "Leon Lütcke",
  signature: null,
  customerSignerName: "",
  customerSignature: null,
});
const text = new TextDecoder("latin1").decode(pdf).replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(Number.parseInt(oct, 8)));
assert.ok(pdf.length > 500);
assert.match(text, /Stundenzettel/);
assert.match(text, /S-2026-0004/);
assert.match(text, /Erika Muster/);
assert.match(text, /Hecke/);
assert.match(text, /Beete/);
assert.match(text, new RegExp(hashA));
assert.match(text, /einfache/);
assert.match(text, /elektronische Signatur/);
assert.match(text, /Leon L.tcke|Leon Lütcke/);

console.log("timesheet checks ok");
