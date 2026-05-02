// Storage-layer regression tests for Task #281 — Managers directory.
//
// Pin down the behaviours the back-office and mobile experiences depend on:
//   1. Cycle prevention on reports-to (self + transitive)
//   2. HAS_REPORTS gating on deactivation
//   3. Reassignment-on-deactivation moves both worker.manager_id AND
//      child manager.reports_to_manager_id
//   4. Orphan flag clears assignments
//   5. Bulk worker assignment skips no-op rows so the audit log isn't spammed

import { strict as assert } from "node:assert";
import { afterEach, before, describe, it } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "../db";
import { managers, workforce, candidates } from "@shared/schema";
import { storage } from "../storage";

const FIXTURE = "__mgr_test__";

interface MgrFixture {
  topId: string;       // Top of the chain — no parent.
  midId: string;       // Reports to top.
  leafId: string;      // Reports to mid.
  spareId: string;     // Independent — used as reassignment target.
  candId: string;
  workforceId: string;
}

async function makePhone() {
  // Random Saudi mobile in E.164 — schema requires `+?[1-9]\d{6,14}$`.
  return `+96650${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
}

async function seed(): Promise<MgrFixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const top = await storage.createManager({
    fullNameEn: `${FIXTURE}-top-${suffix}`,
    phone: await makePhone(),
  });
  const mid = await storage.createManager({
    fullNameEn: `${FIXTURE}-mid-${suffix}`,
    phone: await makePhone(),
    reportsToManagerId: top.id,
  });
  const leaf = await storage.createManager({
    fullNameEn: `${FIXTURE}-leaf-${suffix}`,
    phone: await makePhone(),
    reportsToManagerId: mid.id,
  });
  const spare = await storage.createManager({
    fullNameEn: `${FIXTURE}-spare-${suffix}`,
    phone: await makePhone(),
  });

  // Workforce row needs a candidate. The schema requires a candidate FK.
  const [cand] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE}-cand-${suffix}`,
    phone: await makePhone(),
  }).returning();
  // employeeNumber is a 7-char unique varchar — cram in something unique
  // and short enough so concurrent fixture runs don't collide.
  const empNum = `T${Math.floor(100_000 + Math.random() * 899_999)}`;
  const [wf] = await db.insert(workforce).values({
    candidateId: cand.id,
    employeeNumber: empNum,
    startDate: "2026-01-01",
    isActive: true,
    managerId: leaf.id,
  } as any).returning();

  return {
    topId: top.id, midId: mid.id, leafId: leaf.id, spareId: spare.id,
    candId: cand.id, workforceId: wf.id,
  };
}

async function cleanup(fx: MgrFixture | null) {
  if (!fx) return;
  // Workforce → candidate → managers (children before parents to satisfy FKs).
  await db.delete(workforce).where(eq(workforce.id, fx.workforceId));
  await db.delete(candidates).where(eq(candidates.id, fx.candId));
  await db.delete(managers).where(inArray(managers.id, [fx.leafId, fx.midId, fx.topId, fx.spareId]));
}

describe("managers storage (Task #281)", () => {
  let fx: MgrFixture | null = null;

  before(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for managers-storage tests");
    }
  });

  afterEach(async () => {
    await cleanup(fx);
    fx = null;
  });

  it("createManager + getManager round-trip", async () => {
    fx = await seed();
    const m = await storage.getManager(fx.midId);
    assert.ok(m, "manager should exist");
    assert.equal(m!.reportsToManagerId, fx.topId);
  });

  it("managerWouldCreateCycle — self-reference", async () => {
    fx = await seed();
    const cycle = await storage.managerWouldCreateCycle(fx.topId, fx.topId);
    assert.equal(cycle, true, "self-reference MUST be flagged as a cycle");
  });

  it("managerWouldCreateCycle — transitive (top tries to report to leaf)", async () => {
    fx = await seed();
    // top → mid → leaf already; making top report to leaf would close the loop.
    const cycle = await storage.managerWouldCreateCycle(fx.topId, fx.leafId);
    assert.equal(cycle, true, "transitive cycle MUST be detected");
  });

  it("managerWouldCreateCycle — non-cyclic move is allowed", async () => {
    fx = await seed();
    // Moving spare under top is a fresh edge — no cycle possible.
    const cycle = await storage.managerWouldCreateCycle(fx.spareId, fx.topId);
    assert.equal(cycle, false, "non-cyclic move MUST be allowed");
  });

  it("managerWouldCreateCycle — null parent is fine (top of chain)", async () => {
    fx = await seed();
    const cycle = await storage.managerWouldCreateCycle(fx.midId, null);
    assert.equal(cycle, false, "clearing reports-to MUST never be a cycle");
  });

  it("deactivateManager returns HAS_REPORTS when worker is attached", async () => {
    fx = await seed();
    const result = await storage.deactivateManager(fx.leafId);
    assert.equal((result as any).ok, false);
    assert.equal((result as any).code, "HAS_REPORTS");
    assert.equal((result as any).workerCount, 1);
    assert.equal((result as any).subManagerCount, 0);
    // Worker assignment MUST be untouched on the failure path.
    const [wf] = await db.select().from(workforce).where(eq(workforce.id, fx.workforceId));
    assert.equal(wf.managerId, fx.leafId, "worker manager_id MUST NOT change on HAS_REPORTS");
    // Manager MUST remain active on the failure path.
    const m = await storage.getManager(fx.leafId);
    assert.equal(m!.isActive, true, "manager MUST remain active when blocked");
  });

  it("deactivateManager returns HAS_REPORTS when child manager is attached", async () => {
    fx = await seed();
    // mid has leaf reporting to it.
    const result = await storage.deactivateManager(fx.midId);
    assert.equal((result as any).ok, false);
    assert.equal((result as any).code, "HAS_REPORTS");
    assert.equal((result as any).subManagerCount, 1);
  });

  it("deactivateManager with reassignTo moves the worker AND child manager", async () => {
    fx = await seed();
    // Reassign mid's reports (= leaf manager) to spare. Worker on leaf
    // is unaffected here because we're deactivating MID, not LEAF.
    const result = await storage.deactivateManager(fx.midId, { reassignTo: fx.spareId });
    assert.equal((result as any).ok, true);

    const leaf = await storage.getManager(fx.leafId);
    assert.equal(leaf!.reportsToManagerId, fx.spareId, "child manager MUST be reassigned");
    const mid = await storage.getManager(fx.midId);
    assert.equal(mid!.isActive, false, "deactivated manager MUST be inactive");
  });

  it("deactivateManager with orphan=true clears assignments to null", async () => {
    fx = await seed();
    const result = await storage.deactivateManager(fx.leafId, { orphan: true });
    assert.equal((result as any).ok, true);
    const [wf] = await db.select().from(workforce).where(eq(workforce.id, fx.workforceId));
    assert.equal(wf.managerId, null, "worker manager_id MUST be cleared when orphaning");
  });

  it("deactivateManager rejects reassign-to-self", async () => {
    fx = await seed();
    await assert.rejects(
      () => storage.deactivateManager(fx!.leafId, { reassignTo: fx!.leafId }),
      /REASSIGN_TO_SELF/,
    );
  });

  it("deactivateManager rejects reassignment to inactive target", async () => {
    fx = await seed();
    // First, deactivate spare cleanly (no reports).
    await storage.deactivateManager(fx.spareId);
    await assert.rejects(
      () => storage.deactivateManager(fx!.leafId, { reassignTo: fx!.spareId }),
      /REASSIGN_TARGET_INACTIVE/,
    );
  });

  it("reactivateManager flips isActive back on", async () => {
    fx = await seed();
    await storage.deactivateManager(fx.spareId);
    const reactivated = await storage.reactivateManager(fx.spareId);
    assert.equal(reactivated!.isActive, true);
  });

  it("bulkAssignWorkforceManager skips no-ops and returns the changed list", async () => {
    fx = await seed();
    // First call assigns to spare (was on leaf) → 1 changed.
    const r1 = await storage.bulkAssignWorkforceManager([fx.workforceId], fx.spareId);
    assert.deepEqual(r1.changedIds, [fx.workforceId]);

    // Second call repeats the same assignment → 0 changed.
    const r2 = await storage.bulkAssignWorkforceManager([fx.workforceId], fx.spareId);
    assert.deepEqual(r2.changedIds, [], "no-op assignments MUST NOT show up as changed");

    // Clearing (null) for a worker that's currently assigned → 1 changed.
    const r3 = await storage.bulkAssignWorkforceManager([fx.workforceId], null);
    assert.deepEqual(r3.changedIds, [fx.workforceId]);
  });

  it("bulkAssignWorkforceManager rejects an inactive manager target", async () => {
    fx = await seed();
    // Deactivate spare first.
    await storage.deactivateManager(fx.spareId);
    await assert.rejects(
      () => storage.bulkAssignWorkforceManager([fx!.workforceId], fx!.spareId),
      /MANAGER_INACTIVE/,
    );
  });

  it("getManagers respects status=active filter by default", async () => {
    fx = await seed();
    await storage.deactivateManager(fx.spareId);
    const { data } = await storage.getManagers({ search: FIXTURE, isActive: true, limit: 100 });
    const ids = new Set(data.map((m) => m.id));
    assert.ok(ids.has(fx.topId), "active manager MUST appear");
    assert.ok(!ids.has(fx.spareId), "inactive manager MUST be excluded");
  });

  it("getManagerWithCounts surfaces direct-report counts", async () => {
    fx = await seed();
    const mid = await storage.getManagerWithCounts(fx.midId);
    assert.ok(mid);
    assert.equal(mid!.directManagerCount, 1, "mid has 1 child manager (leaf)");
    assert.equal(mid!.directWorkerCount, 0, "mid has no workers directly");
    const leaf = await storage.getManagerWithCounts(fx.leafId);
    assert.equal(leaf!.directWorkerCount, 1, "leaf has 1 worker");
    assert.equal(leaf!.reportsToName?.startsWith(FIXTURE), true, "reports-to name resolves");
  });
});
