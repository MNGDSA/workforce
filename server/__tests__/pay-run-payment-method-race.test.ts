// Task #275 — close the last race window between
// `processPayRun` and `updateWorkforcePaymentMethodGuarded`.
//
// Task #274 added a `SELECT ... FOR UPDATE` row lock + open-lines
// re-check inside the payment-method PATCH so concurrent admin clicks
// can't desync the line snapshot from the employee profile. There was
// still one residual race: an in-flight `processPayRun` could read
// `emp.paymentMethod` BEFORE the lock and insert the line snapshot
// AFTER the PATCH committed the new method, baking in the stale value.
//
// Task #275 fixed this by having `processPayRun` acquire the same per-
// employee row lock before reading `paymentMethod` — the two
// transactions now serialize on the workforce row.
//
// This integration test deterministically reproduces the race:
//   1. An external Postgres tx grabs `FOR UPDATE` on the workforce row
//      and updates its `paymentMethod` from "bank_transfer" to "cash"
//      (uncommitted — the lock is held).
//   2. `storage.processPayRun(...)` is invoked in parallel. Its
//      pre-tx unlocked SELECT reads the COMMITTED value
//      ("bank_transfer"), but inside its tx it must wait on the row
//      lock before re-reading `paymentMethod`.
//   3. We assert `processPayRun` does NOT resolve while the external
//      lock is held — i.e. the lock IS being acquired (no fix => no
//      wait, generator inserts immediately with the stale value).
//   4. We commit the external tx so the PATCH-equivalent change wins.
//   5. `processPayRun` then proceeds, re-reads `paymentMethod`, and
//      inserts the line. The committed line's `paymentMethod` MUST be
//      "cash" — proving the generator picked up the fresh value.
//
// Without the Task #275 lock, step 3 fails (the promise resolves
// immediately) and step 5's assertion fails (the line carries the
// stale "bank_transfer" snapshot).

import { strict as assert } from "node:assert";
import { after, afterEach, before, describe, it } from "node:test";
import pg from "pg";
import { eq, like, sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import {
  candidates,
  events,
  payRuns,
  payRunLines,
  workforce,
} from "@shared/schema";

const FIXTURE_MARKER = "__t275_payment_race__";

interface RaceFixture {
  candidateId: string;
  eventId: string;
  workforceId: string;
  payRunId: string;
  employeeNumber: string;
}

function rand7Digits(): string {
  // Workforce.employeeNumber is varchar(7) NOT NULL with a unique
  // index. A random 7-digit string keeps fixtures from colliding with
  // each other and with seed data.
  return String(Math.floor(1_000_000 + Math.random() * 8_999_999));
}

async function seedFixture(): Promise<RaceFixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const phone = `+9665${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

  const [candidate] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-${suffix}`,
    phone,
  }).returning();

  const [event] = await db.insert(events).values({
    name: `${FIXTURE_MARKER}-event-${suffix}`,
    startDate: "2026-01-01",
  }).returning();

  const [emp] = await db.insert(workforce).values({
    employeeNumber: rand7Digits(),
    candidateId: candidate.id,
    eventId: event.id,
    employmentType: "individual",
    isActive: true,
    startDate: "2026-01-01",
    salary: "10000.00",
    paymentMethod: "bank_transfer",
  }).returning();

  const [run] = await db.insert(payRuns).values({
    name: `${FIXTURE_MARKER}-run-${suffix}`,
    eventId: event.id,
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    mode: "full",
    status: "draft",
  }).returning();

  return {
    candidateId: candidate.id,
    eventId: event.id,
    workforceId: emp.id,
    payRunId: run.id,
    employeeNumber: emp.employeeNumber,
  };
}

async function tearDownFixture(f: RaceFixture | null): Promise<void> {
  if (!f) return;
  // Lines reference both pay run (cascade) and workforce (no cascade);
  // wipe lines explicitly so the workforce/event deletes can proceed.
  await db.delete(payRunLines).where(eq(payRunLines.workforceId, f.workforceId));
  await db.delete(payRuns).where(eq(payRuns.id, f.payRunId));
  await db.delete(workforce).where(eq(workforce.id, f.workforceId));
  await db.delete(events).where(eq(events.id, f.eventId));
  await db.delete(candidates).where(eq(candidates.id, f.candidateId));
}

function buildSslConfig(): false | { rejectUnauthorized: boolean; ca?: string } | undefined {
  // Mirror server/db.ts so the helper Pool talks TLS the same way the
  // app does in production. In dev/test (Replit Postgres, local docker)
  // SSL is left unset and we connect plain-text.
  if (process.env.NODE_ENV !== "production") return undefined;
  const ca = process.env.DATABASE_CA_CERT?.trim();
  if (process.env.INSECURE_DB_TLS === "true") return { rejectUnauthorized: false };
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

describe("processPayRun ↔ payment-method change row-lock serialization (task #275)", () => {
  let fixture: RaceFixture | null = null;
  let helperPool: pg.Pool;

  before(async () => {
    // Safety net — drop stragglers from a previously aborted run.
    // Order matters because of FK dependencies:
    //   pay_run_lines → pay_runs (cascade) and → workforce (no cascade)
    //   workforce      → candidates / events
    // We delete children before parents so a half-cleaned previous
    // run cannot trip FK violations when this run re-seeds.
    await db.delete(payRunLines).where(
      sql`${payRunLines.payRunId} IN (SELECT id FROM ${payRuns} WHERE name LIKE ${`${FIXTURE_MARKER}-run-%`})`,
    );
    await db.delete(payRuns).where(like(payRuns.name, `${FIXTURE_MARKER}-run-%`));
    await db.delete(workforce).where(
      sql`${workforce.candidateId} IN (SELECT id FROM ${candidates} WHERE full_name_en LIKE ${`${FIXTURE_MARKER}-%`})`,
    );
    await db.delete(events).where(like(events.name, `${FIXTURE_MARKER}-event-%`));
    await db.delete(candidates).where(like(candidates.fullNameEn, `${FIXTURE_MARKER}-%`));

    // Dedicated pool so we can hold a long-lived locked tx on one
    // client without competing with the app's pool for connections.
    helperPool = new pg.Pool({
      connectionString: (process.env.DATABASE_URL || "").replace(/[?&]sslmode=[^&]*/, "").replace(/\?$/, ""),
      max: 2,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 2000,
      ssl: buildSslConfig(),
    });
  });

  afterEach(async () => {
    await tearDownFixture(fixture);
    fixture = null;
  });

  after(async () => {
    // Drain the helper pool so the test process can exit cleanly.
    await helperPool.end().catch(() => {});
  });

  it("blocks pay-run line generation while a concurrent payment-method change holds the workforce row lock, then snapshots the post-commit method", async () => {
    fixture = await seedFixture();

    // Step 1: open an external transaction that mimics the locked
    // body of `updateWorkforcePaymentMethodGuarded`. We acquire
    // `SELECT ... FOR UPDATE` on the workforce row and update its
    // `paymentMethod` to "cash" — without committing yet. Any
    // concurrent transaction that tries to lock the same row must
    // wait until we either commit or rollback.
    const lockClient = await helperPool.connect();
    let lockReleased = false;
    try {
      await lockClient.query("BEGIN");
      await lockClient.query(
        "SELECT id, payment_method FROM workforce WHERE id = $1 FOR UPDATE",
        [fixture.workforceId],
      );
      await lockClient.query(
        "UPDATE workforce SET payment_method = 'cash' WHERE id = $1",
        [fixture.workforceId],
      );

      // Step 2: kick off `processPayRun` without awaiting. The pre-tx
      // unlocked SELECT reads the COMMITTED value ("bank_transfer"),
      // but the locked re-read inside the tx must block on us.
      let resolved = false;
      let processError: unknown = null;
      const processPromise = storage
        .processPayRun(fixture.payRunId)
        .then((res) => {
          resolved = true;
          return res;
        })
        .catch((err) => {
          resolved = true;
          processError = err;
          throw err;
        });

      // Step 3: give `processPayRun` enough time to reach the locked
      // SELECT. If the Task #275 lock is in place it MUST still be
      // waiting; if it isn't, the call resolves and inserts the line
      // with the stale "bank_transfer" snapshot.
      await new Promise((r) => setTimeout(r, 600));
      assert.equal(
        resolved,
        false,
        "processPayRun must block on the workforce row lock while the payment-method change is in-flight; if this fails, the Task #275 FOR UPDATE lock is missing or out of order",
      );
      assert.equal(processError, null, "processPayRun must not error while waiting on the row lock");

      // Step 4: commit the external tx so the "cash" update wins. The
      // row lock is released; processPayRun's locked SELECT can now
      // read the freshly-committed value.
      await lockClient.query("COMMIT");
      lockReleased = true;

      // Step 5: processPayRun must complete and the inserted line
      // MUST carry the post-commit method ("cash"), proving it was
      // read AFTER the lock was released, not from the stale pre-tx
      // SELECT.
      const result = await processPromise;
      assert.equal(result.linesCreated, 1, "exactly one pay run line should be created for the seeded employee");

      const lines = await db
        .select({ id: payRunLines.id, paymentMethod: payRunLines.paymentMethod })
        .from(payRunLines)
        .where(eq(payRunLines.payRunId, fixture.payRunId));
      assert.equal(lines.length, 1, "expected exactly one line for the fixture pay run");
      assert.equal(
        lines[0].paymentMethod,
        "cash",
        "pay run line MUST snapshot the post-commit payment method ('cash'), not the stale pre-tx value ('bank_transfer'). If this fails, processPayRun is reading paymentMethod outside the row lock and the Task #275 race window is open.",
      );
    } finally {
      if (!lockReleased) {
        // Defensive: if we threw before COMMIT, roll the external tx
        // back so we don't leak a lock or a dangling "cash" update.
        await lockClient.query("ROLLBACK").catch(() => {});
      }
      lockClient.release();
    }
  });
});
