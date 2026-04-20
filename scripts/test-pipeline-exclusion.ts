// Task #107 — Smoke test for assertIndividualPipelineEligible.
//
// Inserts two candidates (one individual, one SMP), runs the helper, and
// asserts the SMP id is rejected via SmpPipelineExclusionError. Cleans up
// afterwards. Requires DATABASE_URL.
//
// Run:  npx tsx scripts/test-pipeline-exclusion.ts

import { db } from "../server/db";
import { candidates } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
  assertIndividualPipelineEligible,
  SmpPipelineExclusionError,
} from "../server/pipeline-eligibility";

let pass = 0, fail = 0;
function ok(cond: boolean, name: string) {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else      { fail++; console.error(`✗ ${name}`); }
}

const stamp = Date.now();
const indNid = `1${String(stamp).slice(-9).padStart(9, "0")}`;
const smpNid = `2${String(stamp + 1).slice(-9).padStart(9, "0")}`;

async function main() {
  // Seed two candidates.
  const [ind] = await db.insert(candidates).values({
    fullNameEn: "PipelineTest Individual",
    fullNameAr: "اختبار فردي",
    phone: `05${String(stamp).slice(-8).padStart(8, "0")}`,
    nationalId: indNid,
    classification: "individual",
  } as any).returning({ id: candidates.id });

  const [smp] = await db.insert(candidates).values({
    fullNameEn: "PipelineTest SMP",
    fullNameAr: "اختبار شركة",
    phone: `05${String(stamp + 1).slice(-8).padStart(8, "0")}`,
    nationalId: smpNid,
    classification: "smp",
  } as any).returning({ id: candidates.id });

  try {
    // Empty list is no-op.
    await assertIndividualPipelineEligible([]);
    ok(true, "empty list is a no-op");

    // Individual-only passes.
    await assertIndividualPipelineEligible([ind.id]);
    ok(true, "individual candidate is allowed");

    // SMP-included throws structured error.
    let thrown: unknown = null;
    try {
      await assertIndividualPipelineEligible([ind.id, smp.id]);
    } catch (e) { thrown = e; }
    ok(thrown instanceof SmpPipelineExclusionError, "throws SmpPipelineExclusionError when SMP id present");
    if (thrown instanceof SmpPipelineExclusionError) {
      ok(thrown.blockedIds.includes(smp.id), "blockedIds contains the SMP candidate");
      ok(thrown.blockedIds.length === 1, "blockedIds excludes the individual candidate");
      ok(thrown.code === "SMP_NOT_ELIGIBLE", "error.code === SMP_NOT_ELIGIBLE");
      ok(thrown.i18nKey === "pipeline.smpNotEligible", "error.i18nKey set");
    }
  } finally {
    // Cleanup.
    await db.delete(candidates).where(inArray(candidates.id, [ind.id, smp.id]));
  }

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
