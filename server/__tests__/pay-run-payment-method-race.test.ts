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

  it("surfaces an OPEN_PAY_RUN_LINES block when a concurrent payment-method PATCH arrives mid-flight after processPayRun has already locked the workforce row (task #280)", async () => {
    fixture = await seedFixture();

    // Reverse direction of the existing race test: here `processPayRun`
    // wins the workforce row lock first and the admin's
    // `updateWorkforcePaymentMethodGuarded` PATCH must observe the
    // freshly-inserted pending line in its open-lines re-check (returning
    // `{ ok: false, blocked: true, openLines: [...] }`) instead of
    // silently completing and desyncing the line snapshot from the
    // employee profile.
    //
    // Making this deterministic without monkey-patching `processPayRun`
    // requires a "trapdoor": we hold a `FOR UPDATE` lock on the *pay_runs*
    // row from a helper tx. `processPayRun` will:
    //   1. acquire the workforce row lock (Task #275)
    //   2. INSERT the pending pay_run_lines row
    //   3. block on its trailing `UPDATE pay_runs SET status='processing'`
    //      because we're holding the row lock on that pay_runs row
    // While it's blocked at step 3 it is still holding the workforce row
    // lock and the inserted line is NOT YET committed. We fire the PATCH:
    //   * With Task #275's per-employee FOR UPDATE in `processPayRun`,
    //     the PATCH's own `SELECT ... FOR UPDATE` on workforce blocks on
    //     processPayRun and only runs its open-lines re-check AFTER we
    //     release the helper lock, processPayRun commits, and the line
    //     becomes visible. The re-check then sees the line and returns
    //     `blocked: true`.
    //   * Without that lock, the PATCH would NOT wait, would run its
    //     open-lines re-check while the line is still uncommitted, would
    //     see no open lines, and would return `ok: true` — silently
    //     baking a stale paymentMethod into the line that processPayRun
    //     is about to commit. That is precisely the failure mode this
    //     test exists to catch.
    const payRunLockClient = await helperPool.connect();
    let payRunLockReleased = false;
    try {
      await payRunLockClient.query("BEGIN");
      await payRunLockClient.query(
        "SELECT id FROM pay_runs WHERE id = $1 FOR UPDATE",
        [fixture.payRunId],
      );

      // Step 1: kick off processPayRun. It runs its read-only payroll
      // calculation, opens its tx, locks the workforce row, inserts the
      // pending line, then stalls on our pay_runs row lock during the
      // status UPDATE.
      let processResolved = false;
      let processError: unknown = null;
      const processPromise = storage
        .processPayRun(fixture.payRunId)
        .then((res) => {
          processResolved = true;
          return res;
        })
        .catch((err) => {
          processResolved = true;
          processError = err;
          throw err;
        });

      // Give processPayRun enough time to reach its tx, take the
      // workforce row lock, perform the INSERT, and start blocking on
      // our pay_runs lock. If any of those fail to happen, the test
      // can't observe the race in the right direction.
      await new Promise((r) => setTimeout(r, 600));
      assert.equal(
        processResolved,
        false,
        "processPayRun must still be in flight (blocked on the helper pay_runs row lock) before PATCH is fired; if this fails, the helper lock isn't being acquired or processPayRun isn't reaching its trailing UPDATE",
      );
      assert.equal(processError, null, "processPayRun must not error while waiting on the helper pay_runs lock");

      // Step 2: fire the payment-method PATCH guard. With Task #275's
      // per-employee row lock in processPayRun, this MUST block on the
      // workforce row that processPayRun is still holding.
      let patchResolved = false;
      let patchError: unknown = null;
      const patchPromise = storage
        .updateWorkforcePaymentMethodGuarded(fixture.workforceId, {
          paymentMethod: "cash",
        })
        .then((res) => {
          patchResolved = true;
          return res;
        })
        .catch((err) => {
          patchResolved = true;
          patchError = err;
          throw err;
        });

      // Step 3: confirm the PATCH is blocked on processPayRun's
      // workforce lock. If it resolves here, the per-employee FOR UPDATE
      // in processPayRun is missing or out of order — the PATCH ran its
      // open-lines re-check against an uncommitted line snapshot and
      // (incorrectly) saw nothing.
      await new Promise((r) => setTimeout(r, 600));
      assert.equal(
        patchResolved,
        false,
        "updateWorkforcePaymentMethodGuarded must block on the workforce row lock held by the in-flight processPayRun tx; if this fails, the per-employee FOR UPDATE in processPayRun (Task #275) is missing or out of order, leaving the reverse-direction race open",
      );
      assert.equal(patchError, null, "PATCH must not error while waiting on the workforce row lock");

      // Step 4: release the helper lock so processPayRun's UPDATE can
      // proceed, the tx can commit, and the workforce row lock can drop.
      await payRunLockClient.query("COMMIT");
      payRunLockReleased = true;

      // Step 5: processPayRun completes with the one inserted line.
      const processResult = await processPromise;
      assert.equal(processResult.linesCreated, 1, "exactly one pay-run line should be created for the seeded employee");

      // Step 6: PATCH unblocks, takes the workforce row lock, runs its
      // open-lines re-check inside the locked tx, and MUST see the
      // freshly-committed pending line.
      const patchResult = await patchPromise;
      assert.equal(
        patchResult.ok,
        false,
        "PATCH must NOT report ok:true — there is now a pending pay_run_lines row for this employee on a non-completed run; allowing the method flip would desync the line snapshot from the employee profile",
      );
      assert.equal(
        patchResult.ok === false && patchResult.blocked === true,
        true,
        "PATCH must surface the open-line block (`blocked: true`) — not 404 or any other shape",
      );
      // TypeScript narrowing: at this point the discriminated union
      // collapses to the blocked variant.
      if (!(patchResult.ok === false && patchResult.blocked === true)) {
        throw new Error("unreachable: patchResult should be the blocked variant");
      }
      assert.equal(
        patchResult.openLines.length,
        1,
        "exactly one open-line summary should be returned (the one processPayRun just inserted)",
      );
      assert.equal(
        patchResult.openLines[0].payRunId,
        fixture.payRunId,
        "the open-line summary must reference the pay run that processPayRun just generated",
      );
      assert.equal(
        patchResult.openLines[0].paymentMethod,
        "bank_transfer",
        "the snapshotted line must still carry the pre-PATCH method ('bank_transfer') — proving the PATCH did NOT silently update the workforce row first",
      );

      // Step 7: workforce.payment_method MUST be unchanged. The guard
      // refused the update, so the row is still on the original method.
      const [empAfter] = await db
        .select({ paymentMethod: workforce.paymentMethod })
        .from(workforce)
        .where(eq(workforce.id, fixture.workforceId));
      assert.equal(
        empAfter.paymentMethod,
        "bank_transfer",
        "workforce.payment_method must NOT have flipped to 'cash' — the guard must have aborted the UPDATE on the open-lines re-check",
      );
    } finally {
      if (!payRunLockReleased) {
        // Defensive: if we threw before COMMIT, roll the helper tx back
        // so we don't leak the pay_runs row lock or the helper client.
        await payRunLockClient.query("ROLLBACK").catch(() => {});
      }
      payRunLockClient.release();
    }
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
