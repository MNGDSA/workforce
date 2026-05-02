// Excel import regression tests for Task #281 — Managers directory.
//
// Cover the rules the operator + UI rely on:
//   1. Template builds as a 3-sheet workbook with the canonical
//      snake_case headers per spec
//   2. Pure parse-stage validation catches bad / duplicate rows BEFORE
//      anything is written
//   3. End-to-end import (parse → resolve refs → upsert → reports-to)
//      works for forward references (parent appears AFTER child in the
//      sheet) thanks to the two-pass design
//   4. Re-importing the same sheet updates instead of duplicating
//   5. Self-reports-to and obviously cyclic edges roll the entire
//      batch back (atomic per spec — no partial commits)
//   6. A mid-batch lookup error rolls everything back (atomic)

import { strict as assert } from "node:assert";
import { afterEach, before, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import XLSX from "xlsx";

import { db } from "../db";
import { managers, departments, positions } from "@shared/schema";
import { storage } from "../storage";
import {
  parseManagersSheet,
  importManagersFromBuffer,
  buildManagerImportTemplate,
  COL,
} from "../lib/managers-import";

const FIXTURE = "__mgr_imp__";

interface RefFixture {
  deptId: string;
  deptCode: string;
  positionId: string;
  positionCode: string;
}

async function seedRefs(): Promise<RefFixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // Department `code` is unique (varchar 20). Squeeze the suffix into
  // the budget so concurrent runs don't collide.
  const code = `T${suffix.slice(0, 18)}`;
  const positionCode = `P${suffix.slice(0, 18)}`;
  const [dept] = await db.insert(departments).values({
    name: `${FIXTURE}-dept-${suffix}`,
    code,
    isActive: true,
  } as any).returning();
  const [pos] = await db.insert(positions).values({
    title: `${FIXTURE}-pos-${suffix}`,
    code: positionCode,
    departmentId: dept.id,
    isActive: true,
  } as any).returning();
  return { deptId: dept.id, deptCode: code, positionId: pos.id, positionCode };
}

async function cleanupAll(deptId?: string, positionId?: string) {
  // Order: managers (children first via reports_to_manager_id null),
  // then positions, then departments.
  const all = await db.select().from(managers);
  const fixtureMgrs = all.filter((m) => m.fullNameEn.startsWith(FIXTURE));
  if (fixtureMgrs.length > 0) {
    const ids = fixtureMgrs.map((m) => m.id);
    await db.update(managers).set({ reportsToManagerId: null }).where(inArray(managers.id, ids));
    await db.delete(managers).where(inArray(managers.id, ids));
  }
  if (positionId) await db.delete(positions).where(eq(positions.id, positionId)).catch(() => {});
  if (deptId) await db.delete(departments).where(eq(departments.id, deptId)).catch(() => {});
}

const HEADERS = [
  COL.fullNameEn, COL.fullNameAr, COL.email, COL.phone, COL.whatsapp,
  COL.jisrEmployeeId, COL.departmentCode, COL.positionCode,
  COL.reportsToJisrId, COL.notes,
] as const;

function buildWorkbook(rows: Array<Record<string, string>>): Buffer {
  const aoa = [HEADERS as readonly string[], ...rows.map((r) => HEADERS.map((h) => r[h] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Managers");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("managers Excel import (Task #281)", () => {
  let refs: RefFixture | null = null;

  before(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for managers-import tests");
    }
  });

  afterEach(async () => {
    await cleanupAll(refs?.deptId, refs?.positionId);
    refs = null;
  });

  it("parseManagersSheet skips fully-blank rows and required-fields are enforced", () => {
    const buf = buildWorkbook([
      { [COL.fullNameEn]: "Alpha One", [COL.phone]: "+966500000001" },
      {},                                                  // fully blank, must skip
      { [COL.phone]: "+966500000002" },                    // missing name → error
      { [COL.fullNameEn]: "Bad Phone", [COL.phone]: "abc" },
    ]);
    const ws = XLSX.read(buf, { type: "buffer" }).Sheets["Managers"];
    const { rows, errors } = parseManagersSheet(ws);
    assert.equal(rows.length, 1, "exactly one valid row should pass parse");
    // Two error rows: missing name & bad phone (blank row is silently skipped).
    assert.equal(errors.length, 2);
    const reasons = errors.map((e) => e.message).join("\n");
    assert.match(reasons, /required/i);
    assert.match(reasons, /phone/i);
    // Per-row errors carry the offending field so the UI can highlight
    // the right column.
    const fields = errors.map((e) => e.field);
    assert.ok(fields.includes(COL.fullNameEn));
    assert.ok(fields.includes(COL.phone));
  });

  it("parseManagersSheet rejects in-sheet duplicate phones and Jisr IDs", () => {
    const buf = buildWorkbook([
      { [COL.fullNameEn]: "A", [COL.phone]: "+966500000010", [COL.jisrEmployeeId]: "J-1" },
      { [COL.fullNameEn]: "B", [COL.phone]: "+966500000010", [COL.jisrEmployeeId]: "J-2" },
      { [COL.fullNameEn]: "C", [COL.phone]: "+966500000011", [COL.jisrEmployeeId]: "J-1" },
    ]);
    const ws = XLSX.read(buf, { type: "buffer" }).Sheets["Managers"];
    const { rows, errors } = parseManagersSheet(ws);
    assert.equal(rows.length, 1, "only the first row of each dupe-key wins");
    assert.equal(errors.length, 2);
    const reasons = errors.map((e) => e.message).join("\n");
    assert.match(reasons, /phone .* more than one row/);
    assert.match(reasons, /jisr_employee_id .* more than one row/);
  });

  it("import resolves forward reports-to references (child before parent in sheet)", async () => {
    refs = await seedRefs();
    const buf = buildWorkbook([
      // Child first — at this point the parent doesn't exist yet.
      {
        [COL.fullNameEn]: `${FIXTURE}-child`,
        [COL.phone]: "+966500000020",
        [COL.jisrEmployeeId]: "FWD-CHILD",
        [COL.reportsToJisrId]: "FWD-PARENT",
      },
      // Parent after the child.
      {
        [COL.fullNameEn]: `${FIXTURE}-parent`,
        [COL.phone]: "+966500000021",
        [COL.jisrEmployeeId]: "FWD-PARENT",
      },
    ]);
    const summary = await importManagersFromBuffer(buf);
    assert.equal(summary.errors.length, 0, `import should be error-free; got: ${JSON.stringify(summary.errors)}`);
    assert.equal(summary.created, 2);
    const child = (await db.select().from(managers).where(eq(managers.jisrEmployeeId, "FWD-CHILD")))[0];
    const parent = (await db.select().from(managers).where(eq(managers.jisrEmployeeId, "FWD-PARENT")))[0];
    assert.ok(child && parent);
    assert.equal(child.reportsToManagerId, parent.id, "forward-referenced parent MUST be wired up in pass 2");
  });

  it("import is idempotent — re-uploading the same sheet results in updates, not duplicates", async () => {
    refs = await seedRefs();
    const buf = buildWorkbook([
      {
        [COL.fullNameEn]: `${FIXTURE}-repeat`,
        [COL.phone]: "+966500000030",
        [COL.jisrEmployeeId]: "REPEAT-1",
      },
    ]);
    const first = await importManagersFromBuffer(buf);
    assert.equal(first.created, 1);
    const second = await importManagersFromBuffer(buf);
    assert.equal(second.created, 0);
    assert.equal(second.updated, 1);
    const all = await db.select().from(managers).where(eq(managers.jisrEmployeeId, "REPEAT-1"));
    assert.equal(all.length, 1, "re-import MUST NOT duplicate the row");
  });

  it("import resolves department_code + position_code (case-insensitive) and reports unknowns per row", async () => {
    refs = await seedRefs();
    const buf = buildWorkbook([
      {
        [COL.fullNameEn]: `${FIXTURE}-with-refs`,
        [COL.phone]: "+966500000040",
        [COL.departmentCode]: refs.deptCode.toUpperCase(),  // case-folded match
        [COL.positionCode]: refs.positionCode.toLowerCase(),
      },
      {
        [COL.fullNameEn]: `${FIXTURE}-bad-dept`,
        [COL.phone]: "+966500000041",
        [COL.departmentCode]: "totally-fake-dept-xyz",
      },
    ]);
    const summary = await importManagersFromBuffer(buf);
    // Lookup errors short-circuit before any write — nothing landed.
    assert.ok(summary.errors.length >= 1, "unknown department_code MUST surface as a row error");
    assert.equal(summary.created, 0, "lookup errors MUST abort the write phase");
    // Field is set so the UI can highlight the offending column.
    assert.ok(summary.errors.some((e) => e.field === COL.departmentCode));
    // Confirm the good row didn't sneak in.
    const landed = await db.select().from(managers).where(eq(managers.phone, "+966500000040"));
    assert.equal(landed.length, 0, "atomic import MUST roll back the good row when its sibling fails");
  });

  it("import rolls the entire batch back when a row violates self-reports-to (atomic per spec)", async () => {
    refs = await seedRefs();
    const buf = buildWorkbook([
      {
        [COL.fullNameEn]: `${FIXTURE}-good-row`,
        [COL.phone]: "+966500000049",
        [COL.jisrEmployeeId]: "GOOD-1",
      },
      {
        [COL.fullNameEn]: `${FIXTURE}-self-ref`,
        [COL.phone]: "+966500000050",
        [COL.jisrEmployeeId]: "SELF-REF",
        [COL.reportsToJisrId]: "SELF-REF",
      },
    ]);
    const summary = await importManagersFromBuffer(buf);
    assert.equal(summary.created, 0, "atomic import: nothing lands when any row fails");
    assert.equal(summary.updated, 0);
    assert.ok(summary.errors.length >= 1);
    assert.match(summary.errors.map((e) => e.message).join("\n"), /cannot report to themselves/);
    // Crucially the GOOD row from earlier in the same upload must NOT
    // be in the DB — the transaction rolled it back.
    const goodRow = await db.select().from(managers).where(eq(managers.jisrEmployeeId, "GOOD-1"));
    assert.equal(goodRow.length, 0, "rollback MUST remove the good row that landed before the failure");
    const selfRefRow = await db.select().from(managers).where(eq(managers.jisrEmployeeId, "SELF-REF"));
    assert.equal(selfRefRow.length, 0);
  });

  it("buildManagerImportTemplate produces a 3-sheet workbook with canonical snake_case headers", async () => {
    refs = await seedRefs();
    const buf = await buildManagerImportTemplate(storage);
    const wb = XLSX.read(buf, { type: "buffer" });
    assert.deepEqual(
      wb.SheetNames.sort(),
      ["Departments (Reference)", "Managers", "Positions (Reference)"].sort(),
    );
    const headerRow = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Managers"], { header: 1 })[0];
    assert.deepEqual(headerRow, [
      COL.fullNameEn, COL.fullNameAr, COL.email, COL.phone, COL.whatsapp,
      COL.jisrEmployeeId, COL.departmentCode, COL.positionCode,
      COL.reportsToJisrId, COL.notes,
    ]);
    // Reference sheets expose the `code` column the operator must paste.
    const deptHeader = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Departments (Reference)"], { header: 1 })[0];
    assert.equal(deptHeader[0], "code");
    const posHeader = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Positions (Reference)"], { header: 1 })[0];
    assert.deepEqual(posHeader.slice(0, 3), ["code", "title", "department_code"]);
  });
});
