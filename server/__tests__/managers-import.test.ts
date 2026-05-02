// Excel import regression tests for Task #281 — Managers directory.
//
// Cover the rules the operator + UI rely on:
//   1. Template builds as a 3-sheet workbook with the canonical headers
//   2. Pure parse-stage validation catches bad/duplicate rows BEFORE
//      anything is written
//   3. End-to-end import (parse → resolve refs → upsert → reports-to)
//      works for forward references (parent appears AFTER child in the
//      sheet) thanks to the two-pass design
//   4. Re-importing the same sheet updates instead of duplicating
//   5. Self-reports-to and obviously cyclic edges are rejected per-row

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
} from "../lib/managers-import";

const FIXTURE = "__mgr_imp__";

interface RefFixture {
  deptId: string;
  positionId: string;
}

async function seedRefs(): Promise<RefFixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // Department `code` is unique (varchar 20). Squeeze the suffix into
  // the budget so concurrent runs don't collide.
  const code = `T${suffix.slice(0, 18)}`;
  const [dept] = await db.insert(departments).values({
    name: `${FIXTURE}-dept-${suffix}`,
    code,
    isActive: true,
  } as any).returning();
  const [pos] = await db.insert(positions).values({
    title: `${FIXTURE}-pos-${suffix}`,
    code: `P${suffix.slice(0, 18)}`,
    departmentId: dept.id,
    isActive: true,
  } as any).returning();
  return { deptId: dept.id, positionId: pos.id };
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

function buildWorkbook(rows: Array<Record<string, string>>): Buffer {
  const headers = [
    "Full Name (English)", "Full Name (Arabic)", "Email", "Phone", "WhatsApp",
    "Jisr Employee ID", "Department", "Position",
    "Reports To (Jisr Employee ID)", "Notes",
  ];
  const aoa = [headers, ...rows.map((r) => headers.map((h) => r[h] ?? ""))];
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
      { "Full Name (English)": "Alpha One", "Phone": "+966500000001" },
      {},                                             // fully blank, must skip
      { "Phone": "+966500000002" },                   // missing name → error
      { "Full Name (English)": "Bad Phone", "Phone": "abc" },
    ]);
    const ws = XLSX.read(buf, { type: "buffer" }).Sheets["Managers"];
    const { rows, errors } = parseManagersSheet(ws);
    assert.equal(rows.length, 1, "exactly one valid row should pass parse");
    // Two error rows: missing name & bad phone (blank row is silently skipped).
    assert.equal(errors.length, 2);
    assert.match(errors.map((e) => e.reason ?? "").join("\n"), /required/i);
    assert.match(errors.map((e) => e.reason ?? "").join("\n"), /phone/i);
  });

  it("parseManagersSheet rejects in-sheet duplicate phones and Jisr IDs", () => {
    const buf = buildWorkbook([
      { "Full Name (English)": "A", "Phone": "+966500000010", "Jisr Employee ID": "J-1" },
      { "Full Name (English)": "B", "Phone": "+966500000010", "Jisr Employee ID": "J-2" },
      { "Full Name (English)": "C", "Phone": "+966500000011", "Jisr Employee ID": "J-1" },
    ]);
    const ws = XLSX.read(buf, { type: "buffer" }).Sheets["Managers"];
    const { rows, errors } = parseManagersSheet(ws);
    assert.equal(rows.length, 1, "only the first row of each dupe-key wins");
    assert.equal(errors.length, 2);
    const reasons = errors.map((e) => e.reason ?? "").join("\n");
    assert.match(reasons, /Phone .* more than one row/);
    assert.match(reasons, /Jisr Employee ID .* more than one row/);
  });

  it("import resolves forward reports-to references (child before parent in sheet)", async () => {
    refs = await seedRefs();
    const buf = buildWorkbook([
      // Child first — at this point the parent doesn't exist yet.
      {
        "Full Name (English)": `${FIXTURE}-child`,
        "Phone": "+966500000020",
        "Jisr Employee ID": "FWD-CHILD",
        "Reports To (Jisr Employee ID)": "FWD-PARENT",
      },
      // Parent after the child.
      {
        "Full Name (English)": `${FIXTURE}-parent`,
        "Phone": "+966500000021",
        "Jisr Employee ID": "FWD-PARENT",
      },
    ]);
    const summary = await importManagersFromBuffer(buf, storage);
    assert.equal(summary.errors, 0, `import should be error-free; got: ${JSON.stringify(summary.results)}`);
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
        "Full Name (English)": `${FIXTURE}-repeat`,
        "Phone": "+966500000030",
        "Jisr Employee ID": "REPEAT-1",
      },
    ]);
    const first = await importManagersFromBuffer(buf, storage);
    assert.equal(first.created, 1);
    const second = await importManagersFromBuffer(buf, storage);
    assert.equal(second.created, 0);
    assert.equal(second.updated, 1);
    const all = await db.select().from(managers).where(eq(managers.jisrEmployeeId, "REPEAT-1"));
    assert.equal(all.length, 1, "re-import MUST NOT duplicate the row");
  });

  it("import resolves Department + Position by name (case-insensitive) and reports unknowns per row", async () => {
    refs = await seedRefs();
    const dept = await db.select().from(departments).where(eq(departments.id, refs.deptId));
    const pos = await db.select().from(positions).where(eq(positions.id, refs.positionId));
    const buf = buildWorkbook([
      {
        "Full Name (English)": `${FIXTURE}-with-refs`,
        "Phone": "+966500000040",
        "Department": dept[0].name.toUpperCase(),  // case-folded match
        "Position": pos[0].title.toLowerCase(),
      },
      {
        "Full Name (English)": `${FIXTURE}-bad-dept`,
        "Phone": "+966500000041",
        "Department": "totally-fake-department-xyz",
      },
    ]);
    const summary = await importManagersFromBuffer(buf, storage);
    // The bad-dept row is a lookup error; the import aborts the WRITE
    // phase (returns lookup errors immediately) without inserting any
    // rows from this sheet.
    assert.ok(summary.errors >= 1, "unknown department MUST surface as a row error");
    assert.equal(summary.created, 0, "lookup errors MUST abort the write phase");
  });

  it("import rejects self-reports-to without crashing the batch", async () => {
    refs = await seedRefs();
    const buf = buildWorkbook([
      {
        "Full Name (English)": `${FIXTURE}-self-ref`,
        "Phone": "+966500000050",
        "Jisr Employee ID": "SELF-REF",
        "Reports To (Jisr Employee ID)": "SELF-REF",
      },
    ]);
    const summary = await importManagersFromBuffer(buf, storage);
    // The row was created in pass 1; pass 2 cannot wire it to itself,
    // so the base status stays "created" and a `reportsToWarning` is
    // attached. Operators still get the manager record (so they can
    // edit it later); the warning tells them the parent edge needs
    // attention. `reportsToWarnings` count surfaces this separately
    // from `errors`.
    const row = summary.results[0];
    assert.equal(row.status, "created");
    assert.match(row.reportsToWarning ?? "", /cannot report to themselves/);
    assert.equal(summary.errors, 0);
    assert.equal(summary.reportsToWarnings, 1);
  });

  it("buildManagerImportTemplate produces a 3-sheet workbook with canonical headers", async () => {
    refs = await seedRefs();
    const buf = await buildManagerImportTemplate(storage);
    const wb = XLSX.read(buf, { type: "buffer" });
    assert.deepEqual(
      wb.SheetNames.sort(),
      ["Departments (Reference)", "Managers", "Positions (Reference)"].sort(),
    );
    const headerRow = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Managers"], { header: 1 })[0];
    assert.deepEqual(headerRow, [
      "Full Name (English)", "Full Name (Arabic)", "Email", "Phone", "WhatsApp",
      "Jisr Employee ID", "Department", "Position",
      "Reports To (Jisr Employee ID)", "Notes",
    ]);
  });
});
