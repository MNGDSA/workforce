// Task #166 — pin the contract of the rotation-rescue rolling
// counter so SRE has a real metric to read instead of a console.log.
//
// What we lock here:
//   - The summary starts empty (no `successRate` exposed as 0% — null
//     instead, because "0/0" should not render as "0% success").
//   - Each outcome (`persisted_90`, `persisted_-90`, `persist_failed`)
//     is bucketed independently and rolls up to total / attempts.
//   - `successRate` = (persisted_90 + persisted_-90) / attempts,
//     rounded to 4 decimals so the admin endpoint returns a stable
//     number rather than 0.6666666666666666.
//   - Returned timestamps are ISO strings (matches the rekognition-
//     fallbacks endpoint shape and the dashboard renderer).
//
// Run with: `npm test`, or
// `npx tsx --test server/__tests__/rotation-rescue-telemetry.test.ts`.

import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";

import {
  recordRotationRescueOutcome,
  getRotationRescueSummary,
  __resetRotationRescueTelemetryForTests,
} from "../rotation-rescue-telemetry";

describe("rotation-rescue-telemetry — Task #166", () => {
  beforeEach(() => {
    __resetRotationRescueTelemetryForTests();
  });

  it("starts empty with successRate=null (distinct from 0% success)", () => {
    const s = getRotationRescueSummary();
    assert.equal(s.total, 0);
    assert.equal(s.persisted90, 0);
    assert.equal(s.persistedNeg90, 0);
    assert.equal(s.persistFailed, 0);
    assert.equal(s.attempts, 0);
    assert.equal(
      s.successRate,
      null,
      "with zero attempts the rate is undefined, not 0",
    );
    assert.equal(s.oldestAt, null);
    assert.equal(s.mostRecentAt, null);
    assert.equal(s.windowHours, 24);
  });

  it("buckets each outcome kind into its own counter", () => {
    recordRotationRescueOutcome("persisted_90");
    recordRotationRescueOutcome("persisted_90");
    recordRotationRescueOutcome("persisted_-90");
    recordRotationRescueOutcome("persist_failed");

    const s = getRotationRescueSummary();
    assert.equal(s.total, 4);
    assert.equal(s.persisted90, 2);
    assert.equal(s.persistedNeg90, 1);
    assert.equal(s.persistFailed, 1);
    assert.equal(s.attempts, 4);
  });

  it("computes successRate = persisted / attempts, rounded to 4 decimals", () => {
    // 2 persisted, 1 failed → 2/3 = 0.6666...
    recordRotationRescueOutcome("persisted_90");
    recordRotationRescueOutcome("persisted_-90");
    recordRotationRescueOutcome("persist_failed");

    const s = getRotationRescueSummary();
    assert.equal(s.successRate, 0.6667);
  });

  it("reports successRate=1 when every persist succeeded", () => {
    recordRotationRescueOutcome("persisted_90");
    recordRotationRescueOutcome("persisted_-90");
    assert.equal(getRotationRescueSummary().successRate, 1);
  });

  it("reports successRate=0 when every persist failed (distinct from null)", () => {
    // The "S3 IAM regression" alert: attempts > 0 but nothing
    // landed. Must not coalesce with "no traffic" (null).
    recordRotationRescueOutcome("persist_failed");
    recordRotationRescueOutcome("persist_failed");
    const s = getRotationRescueSummary();
    assert.equal(s.attempts, 2);
    assert.equal(s.successRate, 0);
  });

  it("returns ISO timestamps for oldest and most recent events", () => {
    recordRotationRescueOutcome("persisted_90");
    const s = getRotationRescueSummary();
    assert.match(s.oldestAt!, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.match(s.mostRecentAt!, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
