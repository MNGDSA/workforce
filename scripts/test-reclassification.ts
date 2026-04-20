// Task #107 — Smoke test for getCandidateBlockers + reclassification gate.
//
// Verifies the blocker helper:
//   • reports active_workforce when an active workforce row exists
//   • reports pending_application when a non-terminal application row exists
//   • reports no reasons for a clean candidate (eligible to reclassify)
// Requires DATABASE_URL.
//
// Run:  npx tsx scripts/test-reclassification.ts

import { db } from "../server/db";
import { candidates, workforce, applications, jobPostings as jobs } from "../shared/schema";
import { eq, inArray } from "drizzle-orm";
import { getCandidateBlockers } from "../server/candidate-blockers";

let pass = 0, fail = 0;
function ok(cond: boolean, name: string) {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else      { fail++; console.error(`✗ ${name}`); }
}

const stamp = Date.now();
const mkNid = (off: number) => `3${String(stamp + off).slice(-9).padStart(9, "0")}`;
const mkPhone = (off: number) => `05${String(stamp + off).slice(-8).padStart(8, "0")}`;

async function main() {
  const cleanIds: string[] = [];
  let createdJobId: string | null = null;

  try {
    // Three candidates: clean, with-workforce, with-application.
    const [c1] = await db.insert(candidates).values({
      fullNameEn: "ReclassTest Clean", fullNameAr: "نظيف",
      phone: mkPhone(0), nationalId: mkNid(0), classification: "individual",
    } as any).returning({ id: candidates.id });
    const [c2] = await db.insert(candidates).values({
      fullNameEn: "ReclassTest WithWf", fullNameAr: "موظف",
      phone: mkPhone(1), nationalId: mkNid(1), classification: "individual",
    } as any).returning({ id: candidates.id });
    const [c3] = await db.insert(candidates).values({
      fullNameEn: "ReclassTest WithApp", fullNameAr: "متقدم",
      phone: mkPhone(2), nationalId: mkNid(2), classification: "individual",
    } as any).returning({ id: candidates.id });
    cleanIds.push(c1.id, c2.id, c3.id);

    // Active workforce row for c2. employee_number is a 7-char varchar; use a
    // collision-resistant suffix from the timestamp.
    const empNum = String(stamp).slice(-7).padStart(7, "0");
    await db.insert(workforce).values({
      candidateId: c2.id,
      employeeNumber: empNum,
      employmentType: "individual",
      isActive: true,
      startDate: new Date().toISOString().slice(0, 10),
    } as any);

    // Pending application for c3 — pick any existing job, else create one.
    const existingJob = await db.select({ id: jobs.id }).from(jobs).limit(1);
    let jobId: string;
    if (existingJob.length > 0) {
      jobId = existingJob[0].id;
    } else {
      const [j] = await db.insert(jobs).values({
        title: `ReclassTest Job ${stamp}`,
        description: "test",
        status: "active",
      } as any).returning({ id: jobs.id });
      jobId = j.id;
      createdJobId = j.id;
    }
    await db.insert(applications).values({
      candidateId: c3.id,
      jobId,
      status: "new",
    } as any);

    const blockers = await getCandidateBlockers([c1.id, c2.id, c3.id]);
    const byId = Object.fromEntries(blockers.map((b) => [b.candidateId, b.reasons]));

    ok((byId[c1.id] ?? []).length === 0, "clean candidate has zero blockers");
    ok((byId[c2.id] ?? []).includes("active_workforce"), "workforce candidate flagged active_workforce");
    ok((byId[c3.id] ?? []).includes("pending_application"), "applicant flagged pending_application");
  } finally {
    // Cleanup: applications and workforce cascade-deleted via candidates? Be safe:
    if (cleanIds.length > 0) {
      await db.delete(applications).where(inArray(applications.candidateId, cleanIds));
      await db.delete(workforce).where(inArray(workforce.candidateId, cleanIds));
      await db.delete(candidates).where(inArray(candidates.id, cleanIds));
    }
    if (createdJobId) {
      await db.delete(jobs).where(eq(jobs.id, createdJobId));
    }
  }

  console.log(`\nResult: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
