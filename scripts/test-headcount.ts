/**
 * Edge-case verification for the event-headcount Golden Rule.
 * Task #64. Run with:  npx tsx scripts/test-headcount.ts
 *
 * Seeds an isolated event + 11 workforce rows, asserts the count returned
 * by countFilledForEvent matches the spec for every individual scenario,
 * verifies list/detail parity through the storage layer, exercises
 * reinstate / start-offboarding / reassign-event paths, confirms the dead
 * events.filled_positions column is gone, and cleans up.
 */
import { db } from "../server/db";
import {
  candidates,
  events,
  workforce,
  positions,
  departments,
} from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import { countFilledForEvent } from "../server/headcount";
import { storage } from "../server/storage";

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
let seedCounter = 0;
const failures: string[] = [];

function assertEq<T>(name: string, actual: T, expected: T) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  PASS  ${name}  (got ${JSON.stringify(actual)})`);
    pass++;
  } else {
    console.log(
      `  FAIL  ${name}  expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    failures.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
  // Second event used for atomic reassignment (event A → event B).
  const [evtB] = await db
    .insert(events)
    .values({
      name: `${TAG}_event_B`,
      eventType: "duration_based",
      startDate: today(),
      endDate: dayOffset(30),
      status: "active",
      targetHeadcount: 100,
    } as any)
    .returning();

  const eventId = evt.id;
  const eventBId = evtB.id;

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
        phone: `+9665${Math.floor(Math.random() * 1e8)}`,
      } as any)
      .returning();

    seedCounter++;
    const empNum = String(2000000 + (Date.now() % 1000000) + seedCounter).slice(-7);

    const [w] = await db
      .insert(workforce)
      .values({
        candidateId: c.id,
        eventId: spec.eventId === undefined ? eventId : spec.eventId,
        positionId: pos.id,
        employeeNumber: empNum,
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
  // Per-scenario assertions: seed one row, expect a specific delta from
  // the running baseline. We rebuild expected after every step so a
  // regression is pinned to exactly the row that broke it.
  let expected = 0;
  const verify = async (label: string) => {
    const got = await countFilledForEvent(eventId);
    assertEq(`scenario ${label}: count = ${expected}`, got, expected);
  };

  await trackSeed({ label: "01_clean_active",             isActive: true,  endDate: null });
  expected += 1;                                                        // ✓
  await verify("01_clean_active");

  await seed({ label: "02_future_end_date",               isActive: true,  endDate: dayOffset(10) });
  expected += 1;                                                        // ✓
  await verify("02_future_end_date");

  await seed({ label: "03_end_date_today",                isActive: true,  endDate: today() });
  expected += 1;                                                        // ✓ (>= today)
  await verify("03_end_date_today");

  await seed({ label: "04_past_end_date",                 isActive: true,  endDate: dayOffset(-1) });
                                                                        // ✗ (back-dated termination drops immediately)
  await verify("04_past_end_date");

  await seed({ label: "05_inactive_no_end",               isActive: false, endDate: null });
                                                                        // ✗
  await verify("05_inactive_no_end");

  await seed({ label: "06_offboarding_in_progress",       isActive: true,  offboardingStatus: "in_progress" });
                                                                        // ✗
  await verify("06_offboarding_in_progress");

  await seed({ label: "07_offboarding_completed",         isActive: true,  offboardingStatus: "completed" });
                                                                        // ✗
  await verify("07_offboarding_completed");

  await seed({ label: "08_old_start_date",                isActive: true,  startDate: dayOffset(-365), endDate: null });
  expected += 1;                                                        // ✓ (start_date intentionally ignored)
  await verify("08_old_start_date");

  await trackSeed({ label: "09_active_future_start_date", isActive: true,  startDate: dayOffset(7), endDate: null });
  expected += 1;                                                        // ✓ (future-dated start counts immediately)
  await verify("09_active_future_start_date");

  await trackSeed({ label: "10_other_event",              isActive: true,  endDate: null, eventId: null });
                                                                        // ✗ (different event)
  await verify("10_other_event");

  await seed({ label: "11_inactive_and_offboarding",      isActive: false, offboardingStatus: "completed" });
                                                                        // ✗
  await verify("11_inactive_and_offboarding");

  // ── List vs detail parity ──────────────────────────────────────────────
  // The Golden Rule must produce identical numbers regardless of whether
  // the consumer asks for one event or many.
  const detail = await storage.getEvent(eventId);
  assertEq("getEvent.filledPositions matches helper", (detail as any)?.filledPositions, expected);

  const all = await storage.getEvents({ includeArchived: true });
  const fromList = all.find((e: any) => e.id === eventId) as any;
  assertEq("getEvents.filledPositions matches helper", fromList?.filledPositions, expected);
  assertEq("list/detail parity for event A", (detail as any)?.filledPositions, fromList?.filledPositions);

  // ── Atomic event reassignment (A → B) ──────────────────────────────────
  // Move worker 09 from event A to event B; A drops by 1, B rises by 1
  // with no intermediate state where the worker counts on both or neither.
  const beforeA = await countFilledForEvent(eventId);
  const beforeB = await countFilledForEvent(eventBId);
  await db.transaction(async (tx) => {
    await tx
      .update(workforce)
      .set({ eventId: eventBId })
      .where(eq(workforce.id, seeded["09_active_future_start_date"]));
  });
  const afterA = await countFilledForEvent(eventId);
  const afterB = await countFilledForEvent(eventBId);
  assertEq("reassign A→B: A dropped by 1", afterA, beforeA - 1);
  assertEq("reassign A→B: B rose by 1",   afterB, beforeB + 1);
  expected -= 1;

  // Move it back; counts return to baseline.
  await db.transaction(async (tx) => {
    await tx
      .update(workforce)
      .set({ eventId: eventId })
      .where(eq(workforce.id, seeded["09_active_future_start_date"]));
  });
  assertEq("reassign B→A: A back to baseline", await countFilledForEvent(eventId), beforeA);
  assertEq("reassign B→A: B back to baseline", await countFilledForEvent(eventBId), beforeB);
  expected += 1;

  // Reassign null-event row 10 onto our event — count rises by 1.
  await db.update(workforce).set({ eventId: eventId }).where(eq(workforce.id, seeded["10_other_event"]));
  expected += 1;
  assertEq("attach previously-null row to event", await countFilledForEvent(eventId), expected);
  // Detach again — count returns to baseline.
  await db.update(workforce).set({ eventId: null as any }).where(eq(workforce.id, seeded["10_other_event"]));
  expected -= 1;
  assertEq("detach row from event", await countFilledForEvent(eventId), expected);

  // ── startOffboarding drops the count immediately ───────────────────────
  const beforeOff = await countFilledForEvent(eventId);
  await storage.startOffboarding(seeded["01_clean_active"]);
  assertEq("startOffboarding drops count by 1", await countFilledForEvent(eventId), beforeOff - 1);
  // Reverse: clear offboarding_status — count comes back.
  await db
    .update(workforce)
    .set({ offboardingStatus: null, offboardingStartedAt: null })
    .where(eq(workforce.id, seeded["01_clean_active"]));
  assertEq("clearing offboarding restores count", await countFilledForEvent(eventId), beforeOff);

  // ── Archived event still readable & accurate ───────────────────────────
  await db
    .update(events)
    .set({ archivedAt: new Date(), status: "closed" })
    .where(eq(events.id, eventId));
  const archived = await storage.getEvent(eventId);
  assertEq(
    "archived event still returns correct filledPositions",
    (archived as any)?.filledPositions,
    expected,
  );

  // ── Schema introspection: dead column truly gone ───────────────────────
  const colRows = await db.execute(
    sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'filled_positions'`,
  );
  const colCount = (colRows as any).rows?.length ?? (colRows as any).length ?? 0;
  assertEq("events.filled_positions column dropped", colCount, 0);

  // ── Partial index supporting the Golden Rule exists ────────────────────
  const idxRows = await db.execute(
    sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'workforce_event_active_idx'`,
  );
  const idxArr: any[] = (idxRows as any).rows ?? (idxRows as any) ?? [];
  const idxDef = idxArr[0]?.indexdef ?? "";
  const idxOk =
    /event_id/.test(idxDef) &&
    /is_active = true/.test(idxDef) &&
    /offboarding_status IS NULL/.test(idxDef);
  assertEq("workforce_event_active_idx partial index present", idxOk, true);

  // ── Cleanup (FK-safe order: workforce → candidates → event → position → dept) ──
  // First widen cleanup: every workforce row pointing at our test candidates.
  const ourCands = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(sql`${candidates.fullNameEn} LIKE ${'%' + SUFFIX + '%'}`);
  for (const c of ourCands) {
    await db.delete(workforce).where(eq(workforce.candidateId, c.id));
    await db.delete(candidates).where(eq(candidates.id, c.id));
  }
  await db.delete(events).where(eq(events.id, eventId));
  await db.delete(events).where(eq(events.id, eventBId));
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
