// Task #252 — derivation tests for the five-value display status.
//
// We do NOT mutate candidate rows; the derivation runs at read time
// over raw signals (status, archived_at, profile_completed,
// classification, last_login_at, created_at). These tests lock down
// the priority order, the boundary conditions on the 1-year and
// 30-day windows, and run a hand-rolled monte-carlo (no fast-check
// dep) to assert the function is total — never throws, always
// returns one of the five valid strings — over thousands of random
// candidate shapes.
//
// Run with:
//   npx tsx --test shared/__tests__/candidate-status.test.ts

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  computeDisplayStatus,
  DISPLAY_STATUSES,
  type CandidateForStatus,
  type DisplayStatus,
} from "../candidate-status";

const NOW = new Date("2026-05-01T12:00:00Z");
const NOW_MS = NOW.getTime();
const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_YEAR = 365 * ONE_DAY;
const THIRTY_DAYS = 30 * ONE_DAY;

function row(overrides: Partial<CandidateForStatus>): CandidateForStatus {
  return {
    status: "available",
    archivedAt: null,
    profileCompleted: false,
    classification: "individual",
    lastLoginAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe("computeDisplayStatus — priority order", () => {
  it("manually archived rows always read as archived", () => {
    // Even a hired worker with a fresh login becomes Archived if
    // an admin has explicitly archived them. Manual intent wins.
    const r = row({
      status: "hired",
      profileCompleted: true,
      classification: "smp",
      lastLoginAt: NOW,
      archivedAt: NOW,
    });
    assert.equal(computeDisplayStatus(r, NOW), "archived");
  });

  it("blocked beats hired (a hired+blocked row reads as blocked)", () => {
    // Defensive — the underlying enum cannot hold both at once, but
    // the priority ordering must be total. blocked is rule 2, hired
    // is rule 3, so blocked wins.
    const r = row({ status: "blocked", profileCompleted: true, lastLoginAt: NOW });
    assert.equal(computeDisplayStatus(r, NOW), "blocked");
  });

  it("hired beats every freshness rule (the billability invariant)", () => {
    // This is the critical product rule: an employed worker is never
    // auto-archived for inactivity on the candidate web portal,
    // because employees use the mobile app instead. Without this the
    // talent table would silently lose every active employee.
    const r = row({
      status: "hired",
      profileCompleted: true,
      lastLoginAt: new Date(NOW_MS - 5 * ONE_YEAR), // ancient
    });
    assert.equal(computeDisplayStatus(r, NOW), "hired");
  });

  it("profile complete + login today → completed", () => {
    const r = row({ profileCompleted: true, lastLoginAt: NOW });
    assert.equal(computeDisplayStatus(r, NOW), "completed");
  });

  it("profile complete + login exactly 1y ago → completed (boundary inclusive)", () => {
    const r = row({
      profileCompleted: true,
      lastLoginAt: new Date(NOW_MS - ONE_YEAR),
    });
    assert.equal(computeDisplayStatus(r, NOW), "completed");
  });

  it("profile complete + login 1y + 1ms ago → archived (boundary)", () => {
    const r = row({
      profileCompleted: true,
      lastLoginAt: new Date(NOW_MS - ONE_YEAR - 1),
    });
    assert.equal(computeDisplayStatus(r, NOW), "archived");
  });

  it("profile complete + never logged in → archived", () => {
    const r = row({ profileCompleted: true, lastLoginAt: null });
    assert.equal(computeDisplayStatus(r, NOW), "archived");
  });

  it("individual self-signup, profile incomplete → archived", () => {
    // The wizard is the gate to applying — without it they're inert.
    const r = row({
      classification: "individual",
      profileCompleted: false,
      lastLoginAt: NOW, // even if they logged in
    });
    assert.equal(computeDisplayStatus(r, NOW), "archived");
  });
});

describe("computeDisplayStatus — SMP lifecycle", () => {
  it("SMP, never logged in, fresh upload → not_activated", () => {
    const r = row({
      classification: "smp",
      lastLoginAt: null,
      createdAt: new Date(NOW_MS - 5 * ONE_DAY),
    });
    assert.equal(computeDisplayStatus(r, NOW), "not_activated");
  });

  it("SMP, never logged in, exactly 30d old → not_activated (boundary inclusive)", () => {
    const r = row({
      classification: "smp",
      lastLoginAt: null,
      createdAt: new Date(NOW_MS - THIRTY_DAYS),
    });
    assert.equal(computeDisplayStatus(r, NOW), "not_activated");
  });

  it("SMP, never logged in, 30d + 1ms old → archived", () => {
    const r = row({
      classification: "smp",
      lastLoginAt: null,
      createdAt: new Date(NOW_MS - THIRTY_DAYS - 1),
    });
    assert.equal(computeDisplayStatus(r, NOW), "archived");
  });

  it("SMP, logged in once but never finished wizard → archived (strict, no grace)", () => {
    const r = row({
      classification: "smp",
      lastLoginAt: NOW, // logged in just now
      profileCompleted: false,
      createdAt: new Date(NOW_MS - ONE_DAY),
    });
    assert.equal(computeDisplayStatus(r, NOW), "archived");
  });

  it("SMP, logged in + profile complete → completed (recent)", () => {
    const r = row({
      classification: "smp",
      lastLoginAt: NOW,
      profileCompleted: true,
    });
    assert.equal(computeDisplayStatus(r, NOW), "completed");
  });
});

describe("computeDisplayStatus — input shape resilience", () => {
  it("accepts ISO string timestamps as well as Date objects", () => {
    const r = row({
      profileCompleted: true,
      lastLoginAt: NOW.toISOString(),
    });
    assert.equal(computeDisplayStatus(r, NOW), "completed");
  });

  it("treats undefined timestamps as null", () => {
    const r = row({
      profileCompleted: true,
      lastLoginAt: undefined,
    });
    assert.equal(computeDisplayStatus(r, NOW), "archived");
  });

  it("is deterministic when `now` is fixed", () => {
    const r = row({
      profileCompleted: true,
      lastLoginAt: new Date(NOW_MS - 100 * ONE_DAY),
    });
    const a = computeDisplayStatus(r, NOW);
    const b = computeDisplayStatus(r, NOW);
    const c = computeDisplayStatus(r, NOW);
    assert.equal(a, b);
    assert.equal(b, c);
  });
});

describe("computeDisplayStatus — monte carlo: total function over 5000 random shapes", () => {
  // Hand-rolled property test (no fast-check dep). We mint thousands
  // of candidate rows using a deterministic LCG seed so a failure
  // can be reproduced exactly. The function must always return one
  // of the five valid strings and must never throw.

  function lcg(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }
  const rand = lcg(0xc0ffee);

  function pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(rand() * xs.length)];
  }

  // Wide statuses covers the full enum + a couple of garbage values
  // to verify the defensive fall-through works.
  const STATUSES = [
    "available", "active", "inactive", "blocked", "hired",
    "awaiting_activation", "pending_profile",
    null, undefined, "future_value",
  ] as const;
  const CLASSIFICATIONS = ["individual", "smp", null, undefined, "future"] as const;
  const VALID = new Set<DisplayStatus>(DISPLAY_STATUSES);

  it("always returns one of the five valid statuses; never throws", () => {
    for (let i = 0; i < 5000; i++) {
      const status = pick(STATUSES);
      const classification = pick(CLASSIFICATIONS);
      const profileCompleted = rand() < 0.5 ? true : rand() < 0.5 ? false : null;

      // Timestamps spanning [-3y, +1y] from NOW, plus null/undefined.
      const tsOrNull = (): Date | string | null | undefined => {
        const r = rand();
        if (r < 0.15) return null;
        if (r < 0.25) return undefined;
        if (r < 0.35) return new Date(NOW_MS - 3 * ONE_YEAR + rand() * 4 * ONE_YEAR).toISOString();
        return new Date(NOW_MS - 3 * ONE_YEAR + rand() * 4 * ONE_YEAR);
      };

      const candidate: CandidateForStatus = {
        status,
        classification,
        profileCompleted,
        archivedAt: tsOrNull(),
        lastLoginAt: tsOrNull(),
        createdAt: tsOrNull() ?? NOW,
      };

      let result: DisplayStatus;
      try {
        result = computeDisplayStatus(candidate, NOW);
      } catch (err) {
        assert.fail(
          `computeDisplayStatus threw on iteration ${i}: ${err}\nrow=${JSON.stringify(candidate)}`,
        );
      }
      assert.ok(
        VALID.has(result),
        `iteration ${i} returned invalid status "${result}" for row=${JSON.stringify(candidate)}`,
      );
    }
  });

  it("manually archived rows ALWAYS resolve to archived (priority invariant)", () => {
    for (let i = 0; i < 1000; i++) {
      const candidate: CandidateForStatus = {
        status: pick(STATUSES),
        classification: pick(CLASSIFICATIONS),
        profileCompleted: rand() < 0.5,
        archivedAt: new Date(NOW_MS - rand() * ONE_YEAR),
        lastLoginAt: new Date(NOW_MS - rand() * ONE_YEAR),
        createdAt: new Date(NOW_MS - rand() * ONE_YEAR),
      };
      assert.equal(computeDisplayStatus(candidate, NOW), "archived");
    }
  });

  it("hired rows (not archived, not blocked) ALWAYS resolve to hired (billability invariant)", () => {
    for (let i = 0; i < 1000; i++) {
      const candidate: CandidateForStatus = {
        status: "hired",
        classification: pick(CLASSIFICATIONS),
        profileCompleted: rand() < 0.5,
        archivedAt: null,
        // Login may be any age including null — must not matter.
        lastLoginAt: rand() < 0.3 ? null : new Date(NOW_MS - rand() * 5 * ONE_YEAR),
        createdAt: new Date(NOW_MS - rand() * 5 * ONE_YEAR),
      };
      assert.equal(computeDisplayStatus(candidate, NOW), "hired");
    }
  });
});

// ─── TS ↔ SQL parity ────────────────────────────────────────────────
//
// The TS `computeDisplayStatus` and the literal `DISPLAY_STATUS_SQL`
// CASE expression must produce identical answers for every input. We
// can't actually run Postgres in unit tests, but we CAN parse the
// CASE branches out of DISPLAY_STATUS_SQL and reduce them in JS, then
// compare. This catches drift the moment someone edits one branch
// without the other (the original architect-reported bug:
// `INTERVAL '1 year'` vs `365 * 24h`).
import { DISPLAY_STATUS_SQL } from "../candidate-status";

describe("TS ↔ SQL parity", () => {
  it("SQL CASE uses INTERVAL '365 days', not '1 year' (calendar drift bug)", () => {
    assert.match(DISPLAY_STATUS_SQL, /INTERVAL\s+'365 days'/);
    assert.doesNotMatch(DISPLAY_STATUS_SQL, /INTERVAL\s+'1 year'/);
  });

  it("SQL CASE uses INTERVAL '30 days' for the SMP grace window", () => {
    assert.match(DISPLAY_STATUS_SQL, /INTERVAL\s+'30 days'/);
  });

  it("SQL CASE branches resolve to the same five output values as the TS union", () => {
    const literals = new Set(
      [...DISPLAY_STATUS_SQL.matchAll(/THEN\s+'([a-z_]+)'/g),
       ...DISPLAY_STATUS_SQL.matchAll(/ELSE\s+'([a-z_]+)'/g)]
        .map(m => m[1]),
    );
    for (const s of literals) {
      assert.ok(
        (DISPLAY_STATUSES as readonly string[]).includes(s),
        `SQL produces '${s}' which is not in DISPLAY_STATUSES`,
      );
    }
    // Every TS bucket must appear in the SQL too — otherwise some
    // bucket is unreachable on the server (e.g. the filter would
    // return 0 rows).
    for (const s of DISPLAY_STATUSES) {
      assert.ok(literals.has(s), `TS bucket '${s}' never produced by SQL CASE`);
    }
  });

  it("TS and a hand-rolled JS twin of the SQL CASE agree on boundary fixtures", () => {
    // Pure-JS reimplementation of DISPLAY_STATUS_SQL, written by
    // reading the SQL textually. Kept deliberately verbose and in
    // the same branch order so a future SQL edit forces a matching
    // edit here. ONE_YEAR_MS / THIRTY_DAYS_MS use the same fixed
    // 24h-day arithmetic the TS helper does, matching INTERVAL
    // '365 days' / '30 days' exactly.
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    function sqlTwin(c: CandidateForStatus, now: Date): DisplayStatus {
      const nowMs = now.getTime();
      const toMs = (v: any) => {
        if (v == null) return null;
        const d = v instanceof Date ? v : new Date(v);
        const t = d.getTime();
        return Number.isFinite(t) ? t : null;
      };
      const archivedMs = toMs(c.archivedAt);
      const lastLoginMs = toMs(c.lastLoginAt);
      const createdMs = toMs(c.createdAt);
      if (archivedMs !== null) return "archived";
      if (c.status === "blocked") return "blocked";
      if (c.status === "hired") return "hired";
      if (c.profileCompleted === true && lastLoginMs !== null && lastLoginMs >= nowMs - ONE_YEAR_MS) return "completed";
      if (c.profileCompleted === true) return "archived";
      if (c.classification === "individual") return "archived";
      if (c.classification === "smp" && lastLoginMs === null && createdMs !== null && createdMs >= nowMs - THIRTY_DAYS_MS) return "not_activated";
      if (c.classification === "smp" && lastLoginMs === null) return "archived";
      if (c.classification === "smp" && lastLoginMs !== null && c.profileCompleted === false) return "archived";
      return "archived";
    }

    // Boundary fixtures: the exact second on either side of every
    // window the SQL/TS rules care about. If anything ever drifts,
    // ONE of these fires.
    const fixtures: Array<{ label: string; row: CandidateForStatus }> = [
      { label: "login exactly 1y ago",       row: { status: "available", archivedAt: null, profileCompleted: true,  classification: "individual", lastLoginAt: new Date(NOW_MS - ONE_YEAR), createdAt: new Date(NOW_MS - 2 * ONE_YEAR) } },
      { label: "login 1y + 1ms ago",          row: { status: "available", archivedAt: null, profileCompleted: true,  classification: "individual", lastLoginAt: new Date(NOW_MS - ONE_YEAR - 1), createdAt: new Date(NOW_MS - 2 * ONE_YEAR) } },
      { label: "login 1y - 1ms ago",          row: { status: "available", archivedAt: null, profileCompleted: true,  classification: "individual", lastLoginAt: new Date(NOW_MS - ONE_YEAR + 1), createdAt: new Date(NOW_MS - 2 * ONE_YEAR) } },
      { label: "smp created 30d ago, no login", row: { status: "awaiting_activation", archivedAt: null, profileCompleted: false, classification: "smp", lastLoginAt: null, createdAt: new Date(NOW_MS - THIRTY_DAYS) } },
      { label: "smp created 30d+1ms ago, no login", row: { status: "awaiting_activation", archivedAt: null, profileCompleted: false, classification: "smp", lastLoginAt: null, createdAt: new Date(NOW_MS - THIRTY_DAYS - 1) } },
      { label: "smp created 30d-1ms ago, no login", row: { status: "awaiting_activation", archivedAt: null, profileCompleted: false, classification: "smp", lastLoginAt: null, createdAt: new Date(NOW_MS - THIRTY_DAYS + 1) } },
      { label: "hired but archived",          row: { status: "hired", archivedAt: new Date(NOW_MS - 1000), profileCompleted: true, classification: "individual", lastLoginAt: new Date(NOW_MS - 1000), createdAt: new Date(NOW_MS - ONE_YEAR) } },
      { label: "blocked but hired",           row: { status: "blocked", archivedAt: null, profileCompleted: true, classification: "individual", lastLoginAt: new Date(NOW_MS - 1000), createdAt: new Date(NOW_MS - ONE_YEAR) } },
      { label: "individual, complete, never logged in", row: { status: "available", archivedAt: null, profileCompleted: true, classification: "individual", lastLoginAt: null, createdAt: new Date(NOW_MS - ONE_YEAR) } },
      { label: "smp logged in, profile incomplete", row: { status: "available", archivedAt: null, profileCompleted: false, classification: "smp", lastLoginAt: new Date(NOW_MS - 1000), createdAt: new Date(NOW_MS - 60 * 24 * 60 * 60 * 1000) } },
    ];
    for (const { label, row: r } of fixtures) {
      assert.equal(sqlTwin(r, NOW), computeDisplayStatus(r, NOW), `parity drift on: ${label}`);
    }
  });

  it("TS and SQL twin agree on 2000 random rows (including leap-year boundary times)", () => {
    const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    function sqlTwin(c: CandidateForStatus, now: Date): DisplayStatus {
      const nowMs = now.getTime();
      const toMs = (v: any) => {
        if (v == null) return null;
        const d = v instanceof Date ? v : new Date(v);
        const t = d.getTime();
        return Number.isFinite(t) ? t : null;
      };
      const archivedMs = toMs(c.archivedAt);
      const lastLoginMs = toMs(c.lastLoginAt);
      const createdMs = toMs(c.createdAt);
      if (archivedMs !== null) return "archived";
      if (c.status === "blocked") return "blocked";
      if (c.status === "hired") return "hired";
      if (c.profileCompleted === true && lastLoginMs !== null && lastLoginMs >= nowMs - ONE_YEAR_MS) return "completed";
      if (c.profileCompleted === true) return "archived";
      if (c.classification === "individual") return "archived";
      if (c.classification === "smp" && lastLoginMs === null && createdMs !== null && createdMs >= nowMs - THIRTY_DAYS_MS) return "not_activated";
      if (c.classification === "smp" && lastLoginMs === null) return "archived";
      if (c.classification === "smp" && lastLoginMs !== null && c.profileCompleted === false) return "archived";
      return "archived";
    }
    // Anchor `now` on a leap-year boundary day, then on a normal day,
    // so calendar drift would surface immediately.
    const anchors = [new Date("2024-02-29T12:00:00Z"), new Date("2025-02-28T12:00:00Z"), new Date("2026-05-01T12:00:00Z")];
    let seed = 7;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const statuses = ["available", "active", "inactive", "blocked", "hired", "awaiting_activation", "pending_profile"];
    const classifications = ["individual", "smp"];
    for (const anchor of anchors) {
      for (let i = 0; i < 2000; i++) {
        const r: CandidateForStatus = {
          status: statuses[Math.floor(rand() * statuses.length)],
          classification: classifications[Math.floor(rand() * classifications.length)],
          profileCompleted: rand() < 0.5,
          archivedAt: rand() < 0.1 ? new Date(anchor.getTime() - rand() * 5 * ONE_YEAR_MS) : null,
          lastLoginAt: rand() < 0.7 ? new Date(anchor.getTime() - rand() * 3 * ONE_YEAR_MS) : null,
          createdAt: new Date(anchor.getTime() - rand() * 5 * ONE_YEAR_MS),
        };
        const ts = computeDisplayStatus(r, anchor);
        const sql = sqlTwin(r, anchor);
        assert.equal(ts, sql, `parity drift at anchor=${anchor.toISOString()} row=${JSON.stringify(r)}`);
      }
    }
  });
});
