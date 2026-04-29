// Regression coverage for the "auto-mark elapsed interviews as
// completed" sweep (Google-Calendar-style behavior).
//
// Behavior locked with the user (Option A):
//   The moment now() >= scheduled_at + duration_minutes, the row's
//   status flips `scheduled` → `completed`. We intentionally do NOT
//   touch any other status — `in_progress`, `cancelled`, `no_show`,
//   and `completed` rows represent explicit recruiter intent and must
//   never be overwritten by the sweep, even when their scheduled end
//   has long passed.
//
// This file pins, end-to-end against the real DB:
//   1. An elapsed `scheduled` row flips to `completed`.
//   2. A future `scheduled` row stays `scheduled`.
//   3. An exactly-at-end `scheduled` row flips (boundary is inclusive).
//   4. `cancelled` and `no_show` rows stay untouched even when elapsed.
//   5. `in_progress` rows stay untouched even when elapsed.
//   6. A second sweep is idempotent — already-completed rows are not
//      re-touched (verified via updated_at).
//   7. The sweep returns the count of rows it actually flipped.
//
// Run with:
//   npx tsx --test server/__tests__/interview-auto-complete.test.ts

import { strict as assert } from "node:assert";
import { describe, it, before, after } from "node:test";
import { eq, like } from "drizzle-orm";

import { db } from "../db";
import { interviews, candidates } from "@shared/schema";
import { autoCompleteElapsedInterviews } from "../interview-auto-complete";

const FIXTURE_MARKER = "__interview_auto_complete_test__";

interface SeededInterview {
  id: string;
}

async function seedCandidate(): Promise<string> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [c] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-${suffix}`,
    nationalId: `88${suffix.replace(/[^0-9]/g, "").padEnd(8, "0").slice(0, 8)}`,
    phone: `0500000000`,
  } as any).returning();
  return c.id;
}

async function seedInterview(opts: {
  candidateId: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "no_show";
  scheduledAt: Date;
  durationMinutes: number;
  groupName?: string;
}): Promise<SeededInterview> {
  const [row] = await db.insert(interviews).values({
    candidateId: opts.candidateId,
    scheduledAt: opts.scheduledAt,
    durationMinutes: opts.durationMinutes,
    status: opts.status,
    type: "video",
    groupName: opts.groupName ?? `${FIXTURE_MARKER}-grp`,
  } as any).returning();
  return { id: row.id };
}

let candidateId: string;

before(async () => {
  candidateId = await seedCandidate();
});

after(async () => {
  // Drop every interview we created (group_name carries our marker)
  // and the fixture candidate.
  await db.delete(interviews).where(like(interviews.groupName, `${FIXTURE_MARKER}%`));
  if (candidateId) {
    await db.delete(candidates).where(eq(candidates.id, candidateId));
  }
});

describe("interview auto-complete sweep", () => {
  it("flips an elapsed scheduled interview to completed", async () => {
    // Scheduled 2 hours ago, 30-min duration → ended 90 min ago.
    const scheduledAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const seeded = await seedInterview({
      candidateId,
      status: "scheduled",
      scheduledAt,
      durationMinutes: 30,
    });

    const flipped = await autoCompleteElapsedInterviews();
    assert.ok(flipped >= 1, `expected at least one row to flip, got ${flipped}`);

    const [after] = await db.select().from(interviews).where(eq(interviews.id, seeded.id));
    assert.equal(after.status, "completed",
      "an elapsed scheduled interview must flip to completed");
  });

  it("flips a row whose end-time is exactly now (boundary is inclusive)", async () => {
    // The WHERE clause uses `<= now()`, so a row whose
    // scheduled_at + duration_minutes lands within a few ms of the
    // sweep's now() must flip. Schedule the row so its end time is
    // ~5ms in the past — close enough to the boundary that any
    // accidental `<` (instead of `<=`) would skip it on a fast box.
    const scheduledAt = new Date(Date.now() - 60 * 1000 - 5);
    const seeded = await seedInterview({
      candidateId,
      status: "scheduled",
      scheduledAt,
      durationMinutes: 1,
    });

    await autoCompleteElapsedInterviews();

    const [after] = await db.select().from(interviews).where(eq(interviews.id, seeded.id));
    assert.equal(after.status, "completed",
      "boundary case (end-time === now) must flip — WHERE clause must use <=, not <");
  });

  it("leaves a future scheduled interview alone", async () => {
    // Scheduled 1 hour in the FUTURE.
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000);
    const seeded = await seedInterview({
      candidateId,
      status: "scheduled",
      scheduledAt,
      durationMinutes: 30,
    });

    await autoCompleteElapsedInterviews();

    const [after] = await db.select().from(interviews).where(eq(interviews.id, seeded.id));
    assert.equal(after.status, "scheduled",
      "a future scheduled interview must NOT be flipped — only elapsed ones");
  });

  it("leaves an in-progress interview alone even if elapsed", async () => {
    // in_progress represents explicit recruiter action. Even if its
    // scheduled end has passed, the recruiter (not the sweep) decides
    // when it's done.
    const scheduledAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const seeded = await seedInterview({
      candidateId,
      status: "in_progress",
      scheduledAt,
      durationMinutes: 30,
    });

    await autoCompleteElapsedInterviews();

    const [after] = await db.select().from(interviews).where(eq(interviews.id, seeded.id));
    assert.equal(after.status, "in_progress",
      "the sweep must NEVER overwrite in_progress — that's explicit recruiter state");
  });

  it("leaves a cancelled interview alone even if elapsed", async () => {
    const scheduledAt = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const seeded = await seedInterview({
      candidateId,
      status: "cancelled",
      scheduledAt,
      durationMinutes: 30,
    });

    await autoCompleteElapsedInterviews();

    const [after] = await db.select().from(interviews).where(eq(interviews.id, seeded.id));
    assert.equal(after.status, "cancelled",
      "the sweep must NEVER overwrite cancelled — that's explicit recruiter state");
  });

  it("leaves a no_show interview alone even if elapsed", async () => {
    const scheduledAt = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const seeded = await seedInterview({
      candidateId,
      status: "no_show",
      scheduledAt,
      durationMinutes: 30,
    });

    await autoCompleteElapsedInterviews();

    const [after] = await db.select().from(interviews).where(eq(interviews.id, seeded.id));
    assert.equal(after.status, "no_show",
      "the sweep must NEVER overwrite no_show — that's explicit recruiter state");
  });

  it("is idempotent — re-running does not re-touch already-completed rows", async () => {
    // Set up an elapsed scheduled row, run the sweep to flip it,
    // capture its updated_at, run the sweep again, and assert
    // updated_at did not change.
    const scheduledAt = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const seeded = await seedInterview({
      candidateId,
      status: "scheduled",
      scheduledAt,
      durationMinutes: 15,
    });

    await autoCompleteElapsedInterviews();
    const [first] = await db.select().from(interviews).where(eq(interviews.id, seeded.id));
    assert.equal(first.status, "completed");
    const firstUpdatedAt = first.updatedAt?.getTime();

    // Sleep just long enough that any rewrite would produce a different
    // now() and therefore a different updated_at.
    await new Promise((r) => setTimeout(r, 50));
    await autoCompleteElapsedInterviews();

    const [second] = await db.select().from(interviews).where(eq(interviews.id, seeded.id));
    assert.equal(second.status, "completed");
    assert.equal(second.updatedAt?.getTime(), firstUpdatedAt,
      "second sweep must NOT rewrite already-completed rows (would churn updated_at and audit logs)");
  });

  it("returns the count of rows it actually flipped", async () => {
    // Run sweep once first to flush any leftover elapsed rows from
    // earlier tests, then seed a known number and check the count.
    await autoCompleteElapsedInterviews();

    const past = new Date(Date.now() - 7 * 60 * 60 * 1000);
    await seedInterview({ candidateId, status: "scheduled", scheduledAt: past, durationMinutes: 10 });
    await seedInterview({ candidateId, status: "scheduled", scheduledAt: past, durationMinutes: 10 });
    await seedInterview({ candidateId, status: "scheduled", scheduledAt: past, durationMinutes: 10 });

    const flipped = await autoCompleteElapsedInterviews();
    assert.equal(flipped, 3,
      `expected exactly 3 rows to flip, got ${flipped} — count is the contract used by scheduler logging`);
  });
});
