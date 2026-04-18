/**
 * Edge-case verification for the event-headcount Golden Rule.
 * Task #64. Run with:  npx tsx scripts/test-headcount.ts
 *
 * Seeds an isolated event + 11 workforce rows, asserts the count returned
 * by countFilledForEvent matches the spec, then cleans up.
 */
import { db } from "../server/db";
import { candidates, events, workforce, positions, departments } from "../shared/schema";
import { eq } from "drizzle-orm";
import { countFilledForEvent } from "../server/headcount";

const today = () => new Date().toISOString().slice(0, 10);
const dayOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const SUFFIX = `hc_test_${Date.now()}`;
const TAG = `__HEADCOUNT_TEST_${SUFFIX}__`;

let pass = 0;
let fail = 0;
const failures: string[] = [];

function expect(name: string, actual: number, expected: number) {
  if (actual === expected) {
    console.log(`  PASS  ${name}  (got ${actual})`);
    pass++;
  } else {
    console.log(`  FAIL  ${name}  expected ${expected}, got ${actual}`);
    failures.push(`${name}: expected ${expected}, got ${actual}`);
    fail++;
  }
}

async function main() {
  console.log(`\n[headcount-test] Seeding scenario ${SUFFIX}\n`);

  // Required scaffolding: a department, a position, and an event.
  const [dept] = await db
    .insert(departments)
    .values({ name: `${TAG}_dept`, code: `D${SUFFIX.slice(-8)}` } as any)
    .returning();
  const [pos] = await db
    .insert(positions)
    .values({ title: `${TAG}_pos`, code: `P${SUFFIX.slice(-8)}`, departmentId: dept.id } as any)
    .returning();

  const [evt] = await db
    .insert(events)
    .values({
      name: `${TAG}_event`,
      eventType: "duration_based",
      startDate: today(),
      endDate: dayOffset(30),
      status: "active",
      targetHeadcount: 100,
    } as any)
    .returning();

  const eventId = evt.id;

  // Helper to seed one workforce row from a partial spec.
  async function seed(spec: {
    label: string;
    isActive: boolean;
    offboardingStatus?: "in_progress" | "completed" | null;
    endDate?: string | null;
    startDate?: string | null;
    eventId?: string | null;
  }) {
    const [c] = await db
      .insert(candidates)
      .values({
        fullNameEn: `${TAG}_${spec.label}`,
        nationalIdNumber: `${SUFFIX}-${spec.label}`,
        phone: `+9665${Math.floor(Math.random() * 1e8)}`,
      } as any)
      .returning();

    const [w] = await db
      .insert(workforce)
      .values({
        candidateId: c.id,
        eventId: spec.eventId === undefined ? eventId : spec.eventId,
        positionId: pos.id,
        employeeNumber: `${Math.floor(1000000 + Math.random() * 8999999)}`,
        fullNameEn: `${TAG}_${spec.label}`,
        nationalIdNumber: `${SUFFIX}-${spec.label}`,
        startDate: spec.startDate === undefined ? today() : spec.startDate,
        endDate: spec.endDate === undefined ? null : spec.endDate,
        salary: "1000",
        isActive: spec.isActive,
        offboardingStatus: spec.offboardingStatus ?? null,
      } as any)
      .returning();
    return w;
  }

  const seeded: Record<string, string> = {};
  const trackSeed = async (spec: Parameters<typeof seed>[0]) => {
    const w = await seed(spec);
    seeded[spec.label] = w.id;
    return w;
  };

  // ── 11 EDGE-CASE ROWS ──────────────────────────────────────────────────
  // Each row is annotated with whether it should count (✓) or not (✗).
  await trackSeed({ label: "01_clean_active",             isActive: true,  endDate: null });                       // ✓
  await seed({ label: "02_future_end_date",               isActive: true,  endDate: dayOffset(10) });              // ✓
  await seed({ label: "03_end_date_today",                isActive: true,  endDate: today() });                    // ✓ (>= today)
  await seed({ label: "04_past_end_date",                 isActive: true,  endDate: dayOffset(-1) });              // ✗
  await seed({ label: "05_inactive_no_end",               isActive: false, endDate: null });                       // ✗
  await seed({ label: "06_offboarding_in_progress",       isActive: true,  offboardingStatus: "in_progress" });    // ✗
  await seed({ label: "07_offboarding_completed",         isActive: true,  offboardingStatus: "completed" });      // ✗
  await seed({ label: "08_old_start_date",                isActive: true,  startDate: dayOffset(-365), endDate: null });// ✓ (start ignored)
  await seed({ label: "09_active_future_start_date",      isActive: true,  startDate: dayOffset(7), endDate: null });// ✓ (start ignored)
  await trackSeed({ label: "10_other_event",              isActive: true,  endDate: null, eventId: null });        // ✗ (different event)
  await seed({ label: "11_inactive_and_offboarding",      isActive: false, offboardingStatus: "completed" });      // ✗

  // Expected count: rows 01, 02, 03, 08, 09  => 5
  const filled = await countFilledForEvent(eventId);
  expect("countFilledForEvent matches Golden Rule", filled, 5);

  // ── Atomic event reassignment test ─────────────────────────────────────
  // Reassign row 10 from null event to our event — count must rise to 6.
  const tenId = seeded["10_other_event"];
  await db.update(workforce).set({ eventId: eventId }).where(eq(workforce.id, tenId));
  expect("reassigning eventId -> count rises by 1", await countFilledForEvent(eventId), 6);

  // Reassign back; count returns to 5.
  await db.update(workforce).set({ eventId: null as any }).where(eq(workforce.id, tenId));
  expect("reassigning back -> count returns to baseline", await countFilledForEvent(eventId), 5);

  // ── Cleanup (FK-safe order: workforce → candidates → event → position → dept) ──
  for (const wid of Object.values(seeded)) {
    await db.delete(workforce).where(eq(workforce.id, wid));
  }
  const cands = await db.select().from(candidates);
  for (const c of cands) {
    if (c.fullNameEn?.includes(SUFFIX)) {
      await db.delete(workforce).where(eq(workforce.candidateId, c.id));
      await db.delete(candidates).where(eq(candidates.id, c.id));
    }
  }
  await db.delete(events).where(eq(events.id, eventId));
  await db.delete(positions).where(eq(positions.id, pos.id));
  await db.delete(departments).where(eq(departments.id, dept.id));

  console.log(`\n[headcount-test] ${pass} passed, ${fail} failed.\n`);
  if (fail > 0) {
    for (const f of failures) console.log("  - " + f);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("[headcount-test] FATAL:", e);
  process.exit(2);
});
