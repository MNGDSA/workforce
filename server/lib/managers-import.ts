// Excel import + template builder for Task #281 — Managers directory.
//
// Spec contract (see .local/tasks/task-281.md "Excel import — design notes"):
//   • Single sheet `Managers` with canonical snake_case headers:
//       full_name_en | full_name_ar | email | phone | whatsapp |
//       jisr_employee_id | department_code | position_code |
//       reports_to_jisr_id | notes
//   • department_code / position_code resolved against existing tables
//     case-insensitively. Unknown code → row error, no insert.
//   • reports_to_jisr_id resolved against existing managers.jisr_employee_id
//     OR against another row in the same upload (two-pass: first pass
//     creates everyone, second pass wires self-references).
//   • Phone validated against the same E.164 helper as candidates.
//   • Whole import is wrapped in a single DB transaction — atomic. Either
//     every good row commits, or the user sees errors and nothing changed.
//
// Two-pass design:
//   Validation pass (parseManagersSheet) — pure, no DB. Bad headers,
//     missing required cells, malformed phone/email, in-sheet duplicate
//     keys are all caught here. If anything fails, the response carries
//     the per-row breakdown and the transaction never opens.
//   Lookup pass (resolveLookups) — fetches dept/position by code. Unknown
//     codes are reported per-row; if any row has a lookup error, the
//     transaction never opens and nothing is written.
//   Pass 1 (inside tx) — create or update each manager's base fields.
//     Any failure throws and the entire transaction rolls back.
//   Pass 2 (inside the same tx) — wire reports_to_manager_id using a
//     map of jisr_employee_id → managers.id built from the merge of
//     existing rows + rows just written in pass 1. Self-reference and
//     cycle attempts throw and the entire transaction rolls back.
//
// Response contract (route returns 200):
//   { total, created, updated, errors: [{ row, field?, message }] }
//   On a successful import, errors is []. On any failure, created and
//   updated are 0 (rollback) and errors[] carries the failing row(s).

import XLSX from "xlsx";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  managers,
  departments,
  positions,
  type InsertManager,
  type Manager,
} from "@shared/schema";
import type { IStorage } from "../storage";

export interface ImportRowError {
  row: number; // 1-based, header row excluded (Excel-style, so first data row is 2)
  field?: string;
  message: string;
}

export interface ImportRowResult {
  rowNumber: number;
  status: "created" | "updated" | "error";
  managerId?: string;
  fullNameEn?: string;
  jisrEmployeeId?: string | null;
  reason?: string;
  field?: string;
}

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  errors: ImportRowError[];
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
  departmentCode: string | null;
  positionCode: string | null;
  reportsToJisrId: string | null;
  notes: string | null;
}

// Canonical snake_case headers per spec. The parser is tolerant to
// surrounding whitespace and case but the template ships these exact
// strings so anyone exporting from Jisr-HR can map cleanly.
export const COL = {
  fullNameEn: "full_name_en",
  fullNameAr: "full_name_ar",
  email: "email",
  phone: "phone",
  whatsapp: "whatsapp",
  jisrEmployeeId: "jisr_employee_id",
  departmentCode: "department_code",
  positionCode: "position_code",
  reportsToJisrId: "reports_to_jisr_id",
  notes: "notes",
} as const;

const FIELD = COL; // alias used in error.field

// Permissive E.164: starts with + or first digit 1-9, then 6-14 more digits.
const PHONE_RE = /^\+?[1-9]\d{6,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 2000;

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function nullable(v: string): string | null {
  return v.length === 0 ? null : v;
}

// Look up a column value by trying the canonical key first, then any
// case-insensitive match. Tolerant to operators who paste headers from
// older templates.
function pickCell(row: Record<string, unknown>, key: string): string {
  if (key in row) return asString(row[key]);
  const lower = key.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.trim().toLowerCase() === lower) return asString(row[k]);
  }
  return "";
}

/**
 * Parse a workbook sheet into validated row data without touching the
 * database. Returned errors are per-row so the caller can short-circuit
 * before opening a transaction.
 */
export function parseManagersSheet(
  sheet: XLSX.WorkSheet,
): { rows: ParsedRow[]; errors: ImportRowError[] } {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false, // keep cell text formatting (phone numbers stay strings)
  });

  const errors: ImportRowError[] = [];
  const rows: ParsedRow[] = [];

  if (raw.length > MAX_ROWS) {
    errors.push({
      row: 0,
      message: `Sheet has ${raw.length} rows; limit is ${MAX_ROWS}. Split the file and retry.`,
    });
    return { rows: [], errors };
  }

  // Track in-sheet uniqueness so two rows with the same phone or Jisr
  // ID don't both squeak through pass 1 and then collide on the unique
  // index inside the transaction.
  const seenPhones = new Set<string>();
  const seenJisrIds = new Set<string>();
  const seenEmails = new Set<string>();

  raw.forEach((r, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for header row
    const fullNameEn = pickCell(r, COL.fullNameEn);
    const fullNameAr = pickCell(r, COL.fullNameAr);
    const email = pickCell(r, COL.email).toLowerCase();
    const phone = pickCell(r, COL.phone);
    const whatsapp = pickCell(r, COL.whatsapp);
    const jisrEmployeeId = pickCell(r, COL.jisrEmployeeId);
    const departmentCode = pickCell(r, COL.departmentCode);
    const positionCode = pickCell(r, COL.positionCode);
    const reportsToJisrId = pickCell(r, COL.reportsToJisrId);
    const notes = pickCell(r, COL.notes);

    // Skip fully-blank rows silently — operators routinely leave a
    // gap row at the bottom of templates.
    const allBlank = [
      fullNameEn, fullNameAr, email, phone, whatsapp, jisrEmployeeId,
      departmentCode, positionCode, reportsToJisrId, notes,
    ].every((v) => v.length === 0);
    if (allBlank) return;

    const rowErrors: ImportRowError[] = [];
    if (!fullNameEn) {
      rowErrors.push({ row: rowNumber, field: FIELD.fullNameEn, message: `${FIELD.fullNameEn} is required` });
    } else if (fullNameEn.length > 200) {
      rowErrors.push({ row: rowNumber, field: FIELD.fullNameEn, message: `${FIELD.fullNameEn} exceeds 200 characters` });
    }
    if (!phone) {
      rowErrors.push({ row: rowNumber, field: FIELD.phone, message: `${FIELD.phone} is required` });
    } else if (!PHONE_RE.test(phone)) {
      rowErrors.push({ row: rowNumber, field: FIELD.phone, message: `${FIELD.phone} is not a valid international phone number` });
    }
    if (whatsapp && !PHONE_RE.test(whatsapp)) {
      rowErrors.push({ row: rowNumber, field: FIELD.whatsapp, message: `${FIELD.whatsapp} is not a valid international phone number` });
    }
    if (email && !EMAIL_RE.test(email)) {
      rowErrors.push({ row: rowNumber, field: FIELD.email, message: `${FIELD.email} is not a valid email address` });
    }
    if (jisrEmployeeId.length > 40) {
      rowErrors.push({ row: rowNumber, field: FIELD.jisrEmployeeId, message: `${FIELD.jisrEmployeeId} exceeds 40 characters` });
    }

    if (phone && seenPhones.has(phone)) {
      rowErrors.push({ row: rowNumber, field: FIELD.phone, message: `phone ${phone} appears on more than one row` });
    } else if (phone) {
      seenPhones.add(phone);
    }
    if (jisrEmployeeId && seenJisrIds.has(jisrEmployeeId)) {
      rowErrors.push({ row: rowNumber, field: FIELD.jisrEmployeeId, message: `${FIELD.jisrEmployeeId} ${jisrEmployeeId} appears on more than one row` });
    } else if (jisrEmployeeId) {
      seenJisrIds.add(jisrEmployeeId);
    }
    if (email && seenEmails.has(email)) {
      rowErrors.push({ row: rowNumber, field: FIELD.email, message: `${FIELD.email} ${email} appears on more than one row` });
    } else if (email) {
      seenEmails.add(email);
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
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
      departmentCode: nullable(departmentCode),
      positionCode: nullable(positionCode),
      reportsToJisrId: nullable(reportsToJisrId),
      notes: nullable(notes),
    });
  });

  return { rows, errors };
}

/**
 * Resolve department / position references to ids using case-insensitive
 * lookups on the `code` column (NOT name/title — codes are the stable
 * identifier per spec). Unknown codes produce row errors instead of
 * silent skips so the operator sees exactly which cell was wrong.
 */
async function resolveLookups(
  rows: ParsedRow[],
): Promise<{
  deptByCode: Map<string, string>;
  posByCode: Map<string, string>;
  errors: ImportRowError[];
}> {
  const allDepts = await db.select({ id: departments.id, code: departments.code }).from(departments);
  const allPositions = await db.select({ id: positions.id, code: positions.code }).from(positions);
  const deptByCode = new Map<string, string>();
  for (const d of allDepts) deptByCode.set(d.code.trim().toLowerCase(), d.id);
  const posByCode = new Map<string, string>();
  for (const p of allPositions) posByCode.set(p.code.trim().toLowerCase(), p.id);

  const errors: ImportRowError[] = [];
  for (const row of rows) {
    if (row.departmentCode && !deptByCode.has(row.departmentCode.toLowerCase())) {
      errors.push({
        row: row.rowNumber,
        field: FIELD.departmentCode,
        message: `${FIELD.departmentCode} "${row.departmentCode}" not found`,
      });
    }
    if (row.positionCode && !posByCode.has(row.positionCode.toLowerCase())) {
      errors.push({
        row: row.rowNumber,
        field: FIELD.positionCode,
        message: `${FIELD.positionCode} "${row.positionCode}" not found`,
      });
    }
  }
  return { deptByCode, posByCode, errors };
}

// Internal sentinel — thrown inside the tx callback so the transaction
// rolls back and the outer catch can build the per-row error response.
class ImportTxError extends Error {
  constructor(public readonly rowError: ImportRowError) {
    super(rowError.message);
  }
}

/**
 * Run the import end-to-end. Validation and lookup errors short-circuit
 * before the transaction opens. The two write passes run inside a single
 * `db.transaction`, so any failure rolls back every prior row in the same
 * upload. Returns a summary suitable for direct JSON serialisation.
 */
export async function importManagersFromBuffer(
  buffer: Buffer,
  // Storage param kept for signature compatibility with callers/tests; the
  // import goes straight to drizzle so it can run inside a single tx.
  // The unused param is intentional — flipping callers is more work than
  // it's worth for a single argument.
  _storage?: IStorage,
): Promise<ImportSummary> {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === "managers") ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return {
      total: 0, created: 0, updated: 0,
      errors: [{ row: 0, message: "Workbook is empty or has no readable sheet" }],
      results: [{ rowNumber: 0, status: "error", reason: "Workbook is empty or has no readable sheet" }],
    };
  }

  const { rows, errors: parseErrors } = parseManagersSheet(ws);
  if (parseErrors.length > 0) {
    return {
      total: rows.length + parseErrors.length,
      created: 0, updated: 0,
      errors: parseErrors,
      results: parseErrors.map((e) => ({
        rowNumber: e.row, status: "error", reason: e.message, field: e.field,
      })),
    };
  }
  if (rows.length === 0) {
    return {
      total: 0, created: 0, updated: 0,
      errors: [{ row: 0, message: "No data rows found in the Managers sheet" }],
      results: [{ rowNumber: 0, status: "error", reason: "No data rows found in the Managers sheet" }],
    };
  }

  const { deptByCode, posByCode, errors: lookupErrors } = await resolveLookups(rows);
  if (lookupErrors.length > 0) {
    return {
      total: rows.length,
      created: 0, updated: 0,
      errors: lookupErrors,
      results: lookupErrors.map((e) => ({
        rowNumber: e.row, status: "error", reason: e.message, field: e.field,
      })),
    };
  }

  // Pre-fetch existing managers so create-vs-update decisions don't need
  // a per-row read inside the tx. Reads outside the tx are fine because
  // unique-key collisions inside the tx will still abort the import.
  const existing = await db.select().from(managers);
  const byJisr = new Map<string, Manager>();
  const byPhone = new Map<string, Manager>();
  for (const m of existing) {
    if (m.jisrEmployeeId) byJisr.set(m.jisrEmployeeId, m);
    byPhone.set(m.phone, m);
  }

  try {
    const results = await db.transaction(async (tx) => {
      const idsByJisr = new Map<string, string>();
      const idsByPhone = new Map<string, string>();
      for (const [k, v] of byJisr) idsByJisr.set(k, v.id);
      for (const [k, v] of byPhone) idsByPhone.set(k, v.id);

      const out: ImportRowResult[] = [];

      // Pass 1 — create / update base fields. reports_to is wired in
      // pass 2 so forward references work.
      for (const row of rows) {
        const departmentId = row.departmentCode
          ? deptByCode.get(row.departmentCode.toLowerCase())!
          : null;
        const positionId = row.positionCode
          ? posByCode.get(row.positionCode.toLowerCase())!
          : null;

        const matched = (row.jisrEmployeeId && byJisr.get(row.jisrEmployeeId))
          || byPhone.get(row.phone);

        const baseFields: Partial<InsertManager> = {
          fullNameEn: row.fullNameEn,
          fullNameAr: row.fullNameAr,
          email: row.email,
          phone: row.phone,
          whatsapp: row.whatsapp,
          jisrEmployeeId: row.jisrEmployeeId,
          departmentId,
          positionId,
          notes: row.notes,
        };

        try {
          if (matched) {
            const [updated] = await tx
              .update(managers)
              .set({ ...baseFields, updatedAt: new Date() })
              .where(eq(managers.id, matched.id))
              .returning();
            if (!updated) {
              throw new ImportTxError({
                row: row.rowNumber,
                message: `Manager ${matched.id} vanished during update`,
              });
            }
            idsByPhone.set(updated.phone, updated.id);
            if (updated.jisrEmployeeId) idsByJisr.set(updated.jisrEmployeeId, updated.id);
            out.push({
              rowNumber: row.rowNumber, status: "updated",
              managerId: updated.id, fullNameEn: updated.fullNameEn,
              jisrEmployeeId: updated.jisrEmployeeId,
            });
          } else {
            const [created] = await tx
              .insert(managers)
              .values(baseFields as InsertManager)
              .returning();
            idsByPhone.set(created.phone, created.id);
            if (created.jisrEmployeeId) idsByJisr.set(created.jisrEmployeeId, created.id);
            out.push({
              rowNumber: row.rowNumber, status: "created",
              managerId: created.id, fullNameEn: created.fullNameEn,
              jisrEmployeeId: created.jisrEmployeeId,
            });
          }
        } catch (e: any) {
          if (e instanceof ImportTxError) throw e;
          throw new ImportTxError({
            row: row.rowNumber,
            message: String(e?.message ?? e),
          });
        }
      }

      // Pass 2 — wire reports_to_manager_id. Self-reference, unknown
      // parent and cycle attempts all throw to roll the whole batch
      // back. This is the strict "all-or-nothing per file" contract.
      for (const row of rows) {
        if (!row.reportsToJisrId) continue;
        const myResult = out.find((r) => r.rowNumber === row.rowNumber);
        if (!myResult || !myResult.managerId) continue;
        const myId = myResult.managerId;

        const parentId = idsByJisr.get(row.reportsToJisrId);
        if (!parentId) {
          throw new ImportTxError({
            row: row.rowNumber,
            field: FIELD.reportsToJisrId,
            message: `${FIELD.reportsToJisrId} "${row.reportsToJisrId}" not found in this sheet or in the existing directory`,
          });
        }
        if (parentId === myId) {
          throw new ImportTxError({
            row: row.rowNumber,
            field: FIELD.reportsToJisrId,
            message: "a manager cannot report to themselves",
          });
        }

        const cycle = await detectCycleInTx(tx, myId, parentId);
        if (cycle) {
          throw new ImportTxError({
            row: row.rowNumber,
            field: FIELD.reportsToJisrId,
            message: "setting this reports-to would create a cycle",
          });
        }

        const [wired] = await tx
          .update(managers)
          .set({ reportsToManagerId: parentId, updatedAt: new Date() })
          .where(eq(managers.id, myId))
          .returning();
        if (!wired) {
          throw new ImportTxError({
            row: row.rowNumber,
            field: FIELD.reportsToJisrId,
            message: "manager record vanished before reports-to could be set",
          });
        }
      }

      return out;
    });

    return summarise(results, []);
  } catch (e: any) {
    if (e instanceof ImportTxError) {
      // Whole batch rolled back. Mark every parsed row as errored so
      // the response makes it obvious nothing landed; the failing row
      // carries the actual reason / field, the others get a uniform
      // "rolled back" note so the operator can scan and find the cause.
      const failingRow = e.rowError;
      const results: ImportRowResult[] = rows.map((r) => {
        if (r.rowNumber === failingRow.row) {
          return {
            rowNumber: r.rowNumber, status: "error",
            fullNameEn: r.fullNameEn, jisrEmployeeId: r.jisrEmployeeId,
            reason: failingRow.message, field: failingRow.field,
          };
        }
        return {
          rowNumber: r.rowNumber, status: "error",
          fullNameEn: r.fullNameEn, jisrEmployeeId: r.jisrEmployeeId,
          reason: `Rolled back: row ${failingRow.row} failed (${failingRow.message})`,
        };
      });
      return {
        total: rows.length,
        created: 0, updated: 0,
        errors: [failingRow],
        results,
      };
    }
    // Unexpected DB / driver failure — surface as a single batch-level
    // error so the operator sees a meaningful message instead of a 500.
    const message = String(e?.message ?? e);
    return {
      total: rows.length,
      created: 0, updated: 0,
      errors: [{ row: 0, message: `Import failed: ${message}` }],
      results: rows.map((r) => ({
        rowNumber: r.rowNumber, status: "error",
        fullNameEn: r.fullNameEn, jisrEmployeeId: r.jisrEmployeeId,
        reason: `Rolled back: ${message}`,
      })),
    };
  }
}

// Tx-local cycle detection. We can't use the storage helper because it
// reads from the global pool, which would miss reports_to edges set
// earlier in the same transaction. Walks the proposed parent chain up
// to a hard cap.
async function detectCycleInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  selfId: string,
  proposedParentId: string,
): Promise<boolean> {
  if (proposedParentId === selfId) return true;
  const MAX_DEPTH = 50;
  let cursor: string | null = proposedParentId;
  for (let i = 0; i < MAX_DEPTH && cursor; i++) {
    if (cursor === selfId) return true;
    const [next] = await tx
      .select({ reportsToManagerId: managers.reportsToManagerId })
      .from(managers)
      .where(eq(managers.id, cursor));
    cursor = next?.reportsToManagerId ?? null;
  }
  return false;
}

function summarise(results: ImportRowResult[], extraErrors: ImportRowError[]): ImportSummary {
  let created = 0, updated = 0;
  const errors: ImportRowError[] = [...extraErrors];
  for (const r of results) {
    if (r.status === "created") created++;
    else if (r.status === "updated") updated++;
    else if (r.status === "error") {
      errors.push({ row: r.rowNumber, field: r.field, message: r.reason ?? "Unknown error" });
    }
  }
  return { total: results.length, created, updated, errors, results };
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
    COL.jisrEmployeeId, COL.departmentCode, COL.positionCode,
    COL.reportsToJisrId, COL.notes,
  ];
  const example = [
    "Sara Al-Mutairi", "سارة المطيري", "sara@example.com", "+966501234567",
    "+966501234567", "JISR-1001", "OPS", "OPS-MGR",
    "", "Replace this example row with your data; leave reports_to_jisr_id blank for top of chain.",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  // Column widths so the template is actually readable when opened.
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  XLSX.utils.book_append_sheet(wb, ws, "Managers");

  // Sheet 2 — Departments reference. Operators copy `code` (not name)
  // into the department_code column.
  const allDepts = await storage.getDepartments(false);
  const deptRows = [
    ["code", "name"],
    ...allDepts.map((d) => [d.code, d.name]),
  ];
  const wsDepts = XLSX.utils.aoa_to_sheet(deptRows);
  wsDepts["!cols"] = [{ wch: 18 }, { wch: 36 }];
  XLSX.utils.book_append_sheet(wb, wsDepts, "Departments (Reference)");

  // Sheet 3 — Positions reference, with parent department code so
  // operators don't have to guess which one goes where.
  const allPositions = await storage.getAllPositions(false);
  const deptCodeById = new Map(allDepts.map((d) => [d.id, d.code]));
  const deptNameById = new Map(allDepts.map((d) => [d.id, d.name]));
  const posRows: (string | null)[][] = [
    ["code", "title", "department_code", "department_name"],
    ...allPositions.map((p) => [
      p.code,
      p.title,
      deptCodeById.get(p.departmentId) ?? "(unknown)",
      deptNameById.get(p.departmentId) ?? "(unknown)",
    ]),
  ];
  const wsPos = XLSX.utils.aoa_to_sheet(posRows);
  wsPos["!cols"] = [{ wch: 18 }, { wch: 36 }, { wch: 18 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsPos, "Positions (Reference)");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
