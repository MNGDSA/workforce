// Excel import + template builder for Task #281 — Managers directory.
//
// The flow:
//   1. Operator downloads `/api/managers/template` (3 sheets: Managers,
//      Departments (Reference), Positions (Reference)).
//   2. Operator fills in the Managers sheet using the bilingual columns
//      and the Jisr-HR Employee ID where known.
//   3. Operator uploads via `/api/managers/import`.
//   4. Server runs a TWO-PASS import:
//        Validation pass (resolveLookups + parseManagersSheet) — runs
//          BEFORE any writes; structural problems (bad columns, unknown
//          department/position, duplicate phones inside the sheet) bail
//          the entire request and nothing is written.
//        Pass 1 (create / update base fields) — walks rows in order,
//          ABORTS ON FIRST ERROR. The failed row is marked "error" and
//          remaining rows are marked "skipped — earlier row failed".
//          Operator fixes the sheet and re-uploads.
//        Pass 2 (resolve reports-to + cycle check) — walks the rows
//          that succeeded in pass 1 and sets the parent edge. Errors
//          here are recorded as a `reportsToWarning` on the row WITHOUT
//          flipping the base status — the manager record DID land, only
//          the parent edge failed. Pass-2 failures are isolated per row
//          (they do not skip subsequent rows).
//
// Response contract (route returns 200 with body):
//   • errors[]              — pass-1 row failures; base record did NOT
//                             land in the DB. Includes row + message.
//   • reportsToWarnings[]   — pass-2 wiring failures; base record DID
//                             land but the parent edge is missing.
//                             Includes row, managerId, message.
//   • created/updated/skipped/errorCount/reportsToWarningCount counters.
//
// Atomicity caveat: pass 1 writes go through the storage interface,
// which uses the global pool, so an abort during pass 1 does NOT roll
// back rows already written earlier in the loop — it only bounds the
// half-imported window. The response carries the per-row breakdown so
// the operator can see exactly which rows landed and which need a
// follow-up.

import XLSX from "xlsx";
import type { IStorage } from "../storage";
import type { Manager } from "@shared/schema";

export interface ImportRowResult {
  rowNumber: number; // 1-based, header row excluded (Excel-style)
  status: "created" | "updated" | "skipped" | "error";
  managerId?: string;
  fullNameEn?: string;
  jisrEmployeeId?: string | null;
  reason?: string;
  // Pass-2 wiring (reports-to) is reported here so a base row that did
  // land in the DB is not retroactively flipped to "error" just because
  // we couldn't set the parent edge. Pass-1 `status` is preserved
  // (created/updated). The route response surfaces base-row errors via
  // `errors[]` and pass-2 failures via the separate `reportsToWarnings[]`
  // array so callers can distinguish "row didn't land" from "row landed
  // without parent edge".
  reportsToWarning?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  // Count of pass-2 reports-to wiring failures on rows whose base
  // record did persist. Separate from `errors` (which counts base-row
  // failures) so callers can tell "nothing landed" from "landed but
  // missing parent edge".
  reportsToWarnings: number;
  results: ImportRowResult[];
}

interface ParsedRow {
  rowNumber: number;
  fullNameEn: string;
  fullNameAr: string | null;
  email: string | null;
  phone: string;
  whatsapp: string | null;
  jisrEmployeeId: string | null;
  departmentName: string | null;
  positionTitle: string | null;
  reportsToJisrId: string | null;
  notes: string | null;
}

const COL = {
  fullNameEn: "Full Name (English)",
  fullNameAr: "Full Name (Arabic)",
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
  jisrEmployeeId: "Jisr Employee ID",
  departmentName: "Department",
  positionTitle: "Position",
  reportsToJisrId: "Reports To (Jisr Employee ID)",
  notes: "Notes",
} as const;

// Permissive E.164: starts with + or first digit 1-9, then 6-14 more digits.
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Rough cap so a single upload can't blow the API budget. Larger
// imports should be split into multiple sheets — Jisr-HR exports
// rarely exceed a few hundred rows.
const MAX_ROWS = 2000;

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function nullable(v: string): string | null {
  return v.length === 0 ? null : v;
}

/**
 * Parse a workbook sheet (already loaded) into validated row data
 * without touching the database. Returned errors are per-row so the
 * caller can short-circuit before pass 2.
 */
export function parseManagersSheet(
  sheet: XLSX.WorkSheet,
): { rows: ParsedRow[]; errors: ImportRowResult[] } {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false, // keep cell text formatting (phone numbers stay strings)
  });

  const errors: ImportRowResult[] = [];
  const rows: ParsedRow[] = [];

  if (raw.length > MAX_ROWS) {
    errors.push({
      rowNumber: 0,
      status: "error",
      reason: `Sheet has ${raw.length} rows; limit is ${MAX_ROWS}. Split the file and retry.`,
    });
    return { rows: [], errors };
  }

  // Track in-sheet uniqueness so two rows with the same phone or Jisr
  // ID don't both squeak through pass 1 and then collide on the unique
  // index during pass 2.
  const seenPhones = new Set<string>();
  const seenJisrIds = new Set<string>();
  const seenEmails = new Set<string>();

  raw.forEach((r, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for header row
    const fullNameEn = asString(r[COL.fullNameEn]);
    const fullNameAr = asString(r[COL.fullNameAr]);
    const email = asString(r[COL.email]).toLowerCase();
    const phone = asString(r[COL.phone]);
    const whatsapp = asString(r[COL.whatsapp]);
    const jisrEmployeeId = asString(r[COL.jisrEmployeeId]);
    const departmentName = asString(r[COL.departmentName]);
    const positionTitle = asString(r[COL.positionTitle]);
    const reportsToJisrId = asString(r[COL.reportsToJisrId]);
    const notes = asString(r[COL.notes]);

    // Skip fully-blank rows silently — operators routinely leave a
    // gap row at the bottom of templates.
    const allBlank = [
      fullNameEn, fullNameAr, email, phone, whatsapp, jisrEmployeeId,
      departmentName, positionTitle, reportsToJisrId, notes,
    ].every((v) => v.length === 0);
    if (allBlank) return;

    const rowErrors: string[] = [];
    if (!fullNameEn) rowErrors.push(`"${COL.fullNameEn}" is required`);
    if (fullNameEn.length > 200) rowErrors.push(`"${COL.fullNameEn}" exceeds 200 characters`);
    if (!phone) rowErrors.push(`"${COL.phone}" is required`);
    else if (!PHONE_RE.test(phone)) rowErrors.push(`"${COL.phone}" is not a valid international phone number`);
    if (whatsapp && !PHONE_RE.test(whatsapp)) {
      rowErrors.push(`"${COL.whatsapp}" is not a valid international phone number`);
    }
    if (email && !EMAIL_RE.test(email)) {
      rowErrors.push(`"${COL.email}" is not a valid email address`);
    }
    if (jisrEmployeeId.length > 40) {
      rowErrors.push(`"${COL.jisrEmployeeId}" exceeds 40 characters`);
    }

    // In-sheet duplicates — phone is always required so it's the most
    // reliable cross-row key. Jisr ID + email are checked when present.
    if (phone && seenPhones.has(phone)) {
      rowErrors.push(`Phone "${phone}" appears on more than one row`);
    } else if (phone) {
      seenPhones.add(phone);
    }
    if (jisrEmployeeId && seenJisrIds.has(jisrEmployeeId)) {
      rowErrors.push(`Jisr Employee ID "${jisrEmployeeId}" appears on more than one row`);
    } else if (jisrEmployeeId) {
      seenJisrIds.add(jisrEmployeeId);
    }
    if (email && seenEmails.has(email)) {
      rowErrors.push(`Email "${email}" appears on more than one row`);
    } else if (email) {
      seenEmails.add(email);
    }

    if (rowErrors.length > 0) {
      errors.push({
        rowNumber,
        status: "error",
        fullNameEn,
        jisrEmployeeId: nullable(jisrEmployeeId),
        reason: rowErrors.join("; "),
      });
      return;
    }

    rows.push({
      rowNumber,
      fullNameEn,
      fullNameAr: nullable(fullNameAr),
      email: nullable(email),
      phone,
      whatsapp: nullable(whatsapp),
      jisrEmployeeId: nullable(jisrEmployeeId),
      departmentName: nullable(departmentName),
      positionTitle: nullable(positionTitle),
      reportsToJisrId: nullable(reportsToJisrId),
      notes: nullable(notes),
    });
  });

  return { rows, errors };
}

/**
 * Resolve department / position references to ids using case-insensitive
 * lookups. Unknown names produce row errors instead of silent skips so
 * the operator sees exactly which cell was wrong.
 */
async function resolveLookups(
  rows: ParsedRow[],
  storage: IStorage,
): Promise<{ deptByName: Map<string, string>; posByTitle: Map<string, string>; lookupErrors: ImportRowResult[] }> {
  const allDepts = await storage.getDepartments(false);
  const allPositions = await storage.getAllPositions(false);
  const deptByName = new Map<string, string>();
  for (const d of allDepts) deptByName.set(d.name.trim().toLowerCase(), d.id);
  const posByTitle = new Map<string, string>();
  for (const p of allPositions) posByTitle.set(p.title.trim().toLowerCase(), p.id);

  const lookupErrors: ImportRowResult[] = [];
  for (const row of rows) {
    if (row.departmentName && !deptByName.has(row.departmentName.toLowerCase())) {
      lookupErrors.push({
        rowNumber: row.rowNumber,
        status: "error",
        fullNameEn: row.fullNameEn,
        jisrEmployeeId: row.jisrEmployeeId,
        reason: `Department "${row.departmentName}" not found. See the "Departments (Reference)" sheet.`,
      });
    }
    if (row.positionTitle && !posByTitle.has(row.positionTitle.toLowerCase())) {
      lookupErrors.push({
        rowNumber: row.rowNumber,
        status: "error",
        fullNameEn: row.fullNameEn,
        jisrEmployeeId: row.jisrEmployeeId,
        reason: `Position "${row.positionTitle}" not found. See the "Positions (Reference)" sheet.`,
      });
    }
  }
  return { deptByName, posByTitle, lookupErrors };
}

/**
 * Run the import end-to-end. Validation errors short-circuit before any
 * writes. Pass-1 (base create/update) aborts on first error and reports
 * the rest as skipped. Pass-2 (reports-to wiring) records errors per row
 * and continues. Returns a summary suitable for direct JSON serialisation.
 * See the file header for the full atomicity caveat.
 */
export async function importManagersFromBuffer(
  buffer: Buffer,
  storage: IStorage,
): Promise<ImportSummary> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "managers") ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return {
      total: 0, created: 0, updated: 0, skipped: 0, errors: 1, reportsToWarnings: 0,
      results: [{ rowNumber: 0, status: "error", reason: "Workbook is empty or has no readable sheet" }],
    };
  }

  const { rows, errors: parseErrors } = parseManagersSheet(ws);
  if (parseErrors.length > 0) {
    return summarise(parseErrors);
  }
  if (rows.length === 0) {
    return {
      total: 0, created: 0, updated: 0, skipped: 0, errors: 1, reportsToWarnings: 0,
      results: [{ rowNumber: 0, status: "error", reason: "No data rows found in the Managers sheet" }],
    };
  }

  const { deptByName, posByTitle, lookupErrors } = await resolveLookups(rows, storage);
  if (lookupErrors.length > 0) {
    return summarise(lookupErrors);
  }

  // Build a quick view of existing managers by Jisr ID + phone so we
  // can decide create-vs-update without a per-row DB hit.
  const existingPage = await storage.getManagers({ page: 1, limit: 200 });
  // 200 is the page cap we expose; for tenants beyond that we still
  // commit-or-fail safely because the unique indexes catch dupes — but
  // pagination here would lie about updates, so we fetch ALL active +
  // inactive in chunks.
  const existing: Manager[] = [...existingPage.data];
  if (existingPage.total > existingPage.data.length) {
    let page = 2;
    while (existing.length < existingPage.total) {
      const next = await storage.getManagers({ page, limit: 200 });
      existing.push(...next.data);
      if (next.data.length === 0) break;
      page++;
    }
  }
  const byJisr = new Map<string, Manager>();
  const byPhone = new Map<string, Manager>();
  for (const m of existing) {
    if (m.jisrEmployeeId) byJisr.set(m.jisrEmployeeId, m);
    byPhone.set(m.phone, m);
  }

  const results: ImportRowResult[] = [];

  // Pass 1 — create / update without reports-to so the parent of any
  // forward-referenced row exists when we resolve them in pass 2.
  // The created/updated id is recorded against the Jisr ID and phone
  // so pass 2 can resolve references whether they came in as Jisr IDs
  // or by phone.
  // NOTE on atomicity: per-row writes go through the storage interface,
  // which uses the global pool. Wrapping the loop in a single
  // db.transaction would not roll back those writes (they execute on a
  // different connection), so true row-set atomicity would require
  // making `createManager`/`updateManager` tx-aware. Until then, we
  // mitigate by aborting on the first write error so the half-imported
  // window is bounded — see the "abort on first error" guards below.
  const idsByJisr = new Map<string, string>(byJisr.size === 0 ? [] : Array.from(byJisr.entries()).map(([k, v]) => [k, v.id]));
  const idsByPhone = new Map<string, string>(Array.from(byPhone.entries()).map(([k, v]) => [k, v.id]));

  for (const row of rows) {
    try {
      const departmentId = row.departmentName
        ? deptByName.get(row.departmentName.toLowerCase())!
        : null;
      const positionId = row.positionTitle
        ? posByTitle.get(row.positionTitle.toLowerCase())!
        : null;

      const matched = (row.jisrEmployeeId && byJisr.get(row.jisrEmployeeId))
        || byPhone.get(row.phone);

      const baseFields = {
        fullNameEn: row.fullNameEn,
        fullNameAr: row.fullNameAr,
        email: row.email,
        phone: row.phone,
        whatsapp: row.whatsapp,
        jisrEmployeeId: row.jisrEmployeeId,
        departmentId,
        positionId,
        notes: row.notes,
        // reportsTo is set in pass 2.
      };

      if (matched) {
        const updated = await storage.updateManager(matched.id, baseFields);
        if (!updated) {
          // Same fail-fast contract as the catch block below: any pass-1
          // write failure (including the "vanished mid-update" race) aborts
          // the loop. Mark this row as error and the rest as skipped so
          // the operator can fix the sheet and re-upload.
          results.push({
            rowNumber: row.rowNumber, status: "error",
            fullNameEn: row.fullNameEn, jisrEmployeeId: row.jisrEmployeeId,
            reason: "Manager existed but vanished during update",
          });
          markRemainingRowsSkipped(rows, rows.indexOf(row), results);
          return summarise(results);
        }
        idsByPhone.set(updated.phone, updated.id);
        if (updated.jisrEmployeeId) idsByJisr.set(updated.jisrEmployeeId, updated.id);
        results.push({
          rowNumber: row.rowNumber, status: "updated",
          managerId: updated.id, fullNameEn: updated.fullNameEn,
          jisrEmployeeId: updated.jisrEmployeeId,
        });
      } else {
        const created = await storage.createManager(baseFields);
        idsByPhone.set(created.phone, created.id);
        if (created.jisrEmployeeId) idsByJisr.set(created.jisrEmployeeId, created.id);
        results.push({
          rowNumber: row.rowNumber, status: "created",
          managerId: created.id, fullNameEn: created.fullNameEn,
          jisrEmployeeId: created.jisrEmployeeId,
        });
      }
    } catch (e: any) {
      results.push({
        rowNumber: row.rowNumber, status: "error",
        fullNameEn: row.fullNameEn, jisrEmployeeId: row.jisrEmployeeId,
        reason: String(e?.message ?? e),
      });
      markRemainingRowsSkipped(rows, rows.indexOf(row), results);
      return summarise(results);
    }
  }

  // Pass 2 — resolve reports-to. Cycle prevention is the storage
  // layer's responsibility, but we pre-check here so the row error is
  // attached to the correct rowNumber instead of bubbling up as a 500.
  // IMPORTANT: a pass-2 failure does NOT flip the row's pass-1 status
  // back to "error" — the base manager record DID land in the DB and
  // the operator needs to know that. We attach `reportsToWarning`
  // instead, and `summarise()` counts those separately.
  for (const row of rows) {
    if (!row.reportsToJisrId) continue;
    const myResult = results.find((r) => r.rowNumber === row.rowNumber);
    if (!myResult || myResult.status === "error" || myResult.status === "skipped") continue;
    const myId = myResult.managerId;
    if (!myId) continue;

    const parentId = idsByJisr.get(row.reportsToJisrId);
    if (!parentId) {
      myResult.reportsToWarning = `Reports-to Jisr ID "${row.reportsToJisrId}" was not found in this sheet or in the existing directory`;
      continue;
    }

    if (parentId === myId) {
      myResult.reportsToWarning = "A manager cannot report to themselves";
      continue;
    }

    const wouldCycle = await storage.managerWouldCreateCycle(myId, parentId);
    if (wouldCycle) {
      myResult.reportsToWarning = "Setting this reports-to would create a cycle";
      continue;
    }

    try {
      const wired = await storage.updateManager(myId, { reportsToManagerId: parentId });
      if (!wired) {
        // Manager record landed in pass 1 but disappeared between passes
        // (concurrent delete). Surface as a warning so the operator
        // knows the row needs a follow-up — never a silent miss.
        myResult.reportsToWarning = "Manager existed in pass 1 but vanished before reports-to could be set";
      }
    } catch (e: any) {
      myResult.reportsToWarning = `Failed to set reports-to: ${String(e?.message ?? e)}`;
    }
  }

  return summarise(results);
}

// Pass-1 helper: when a row fails, mark every row after it as skipped
// so the response carries one entry per spreadsheet row and the
// operator can scroll to the failure point.
function markRemainingRowsSkipped(
  rows: ParsedRow[],
  failedIndex: number,
  results: ImportRowResult[],
): void {
  for (let i = failedIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    results.push({
      rowNumber: r.rowNumber, status: "skipped",
      fullNameEn: r.fullNameEn,
      jisrEmployeeId: r.jisrEmployeeId,
      reason: "Skipped — earlier row failed; fix the sheet and re-upload",
    });
  }
}

function summarise(results: ImportRowResult[]): ImportSummary {
  let created = 0, updated = 0, skipped = 0, errors = 0, reportsToWarnings = 0;
  for (const r of results) {
    if (r.status === "created") created++;
    else if (r.status === "updated") updated++;
    else if (r.status === "skipped") skipped++;
    else if (r.status === "error") errors++;
    if (r.reportsToWarning) reportsToWarnings++;
  }
  return { total: results.length, created, updated, skipped, errors, reportsToWarnings, results };
}

/**
 * Build a 3-sheet workbook the operator can fill in. Returns a Buffer
 * suitable for `res.send()` with the xlsx content type.
 */
export async function buildManagerImportTemplate(storage: IStorage): Promise<Buffer> {
  const wb = XLSX.utils.book_new();

  // Sheet 1 — the actual import sheet, with one example row that
  // operators are encouraged to delete before saving.
  const headers = [
    COL.fullNameEn, COL.fullNameAr, COL.email, COL.phone, COL.whatsapp,
    COL.jisrEmployeeId, COL.departmentName, COL.positionTitle,
    COL.reportsToJisrId, COL.notes,
  ];
  const example = [
    "Sara Al-Mutairi", "سارة المطيري", "sara@example.com", "+966501234567",
    "+966501234567", "JISR-1001", "Operations", "Operations Manager",
    "", "Replace this example row with your data; leave Reports To blank for top of chain.",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  // Column widths so the template is actually readable when opened.
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  XLSX.utils.book_append_sheet(wb, ws, "Managers");

  // Sheet 2 — Departments reference. Read-only signal to operators
  // about which department names will resolve.
  const allDepts = await storage.getDepartments(false);
  const deptRows = [
    ["Department Name"],
    ...allDepts.map((d) => [d.name]),
  ];
  const wsDepts = XLSX.utils.aoa_to_sheet(deptRows);
  wsDepts["!cols"] = [{ wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsDepts, "Departments (Reference)");

  // Sheet 3 — Positions reference, with their parent department so
  // operators don't have to guess which one goes where.
  const allPositions = await storage.getAllPositions(false);
  const deptById = new Map(allDepts.map((d) => [d.id, d.name]));
  const posRows: (string | null)[][] = [
    ["Position Title", "Department"],
    ...allPositions.map((p) => [p.title, deptById.get(p.departmentId) ?? "(unknown)"]),
  ];
  const wsPos = XLSX.utils.aoa_to_sheet(posRows);
  wsPos["!cols"] = [{ wch: 36 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsPos, "Positions (Reference)");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
