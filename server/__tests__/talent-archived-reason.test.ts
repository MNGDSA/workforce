// Task #262 — integration coverage for the GET /api/candidates
// `?archivedReason=...` filter wired in Task #254.
//
// The shared parity test (`shared/__tests__/candidate-status.test.ts`)
// already pins ARCHIVED_REASON_SQL row-by-row against the JS
// `computeArchivedReason()` helper. What it CAN'T catch is a
// regression in the server-side wiring around it:
//
//   • routes.ts → attachDocumentAvailabilityFlags forwarding the raw
//     `?archivedReason=` query string onto the parsed CandidateQuery.
//   • storage.buildCandidateOtherConditions validating the value
//     against the closed `ARCHIVED_REASON_SET` and pushing the WHERE
//     clause `${ARCHIVED_REASON_EXPR} = ${reason}`.
//   • The interaction with the `archived_at IS NULL` guard, which
//     would silently swallow `manually_archived` rows unless the
//     caller also sets `status=archived` (DERIVED_STATUS_FILTER
//     short-circuits the guard).
//
// A future Drizzle WHERE refactor or a rename of the query parameter
// could break any one of those three wires without the parity test
// noticing. This file drives a real DB through the actual route
// handler and asserts each of the four reason buckets returns
// exactly the rows it should.
//
// Run with:
//   npx tsx --test server/__tests__/talent-archived-reason.test.ts

import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response } from "express";
import { eq, like } from "drizzle-orm";

import { db } from "../db";
import { candidates, users, roles } from "@shared/schema";
import { ARCHIVED_REASONS, type ArchivedReason } from "@shared/candidate-status";

const FIXTURE_MARKER = "__t262_arch_reason__";

type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

let getCandidatesHandler: RouteHandler;

interface CapturedRes {
  res: Response;
  statusCode(): number;
  body(): any;
}

function makeRes(): CapturedRes {
  let statusCode = 200;
  let body: any = undefined;
  const res: any = {
    status(code: number) { statusCode = code; return res; },
    json(payload: any) { body = payload; return res; },
    setHeader() { return res; },
    send(payload: any) { body = payload; return res; },
  };
  return {
    res: res as Response,
    statusCode: () => statusCode,
    body: () => body,
  };
}

function makeReq(opts: { query?: any; userId?: string } = {}): Request {
  return {
    query: opts.query ?? {},
    body: {},
    headers: {},
    params: {},
    ip: "198.51.100.10",
    socket: { remoteAddress: "198.51.100.10" },
    // Simulate post-middleware auth state. The handler does not
    // re-check perms (the layer above does) but it does read these
    // fields when other helpers (logAudit) reach for them.
    authUserId: opts.userId,
    authPermissions: new Set(["candidates:read"]),
    authIsSuperAdmin: false,
    get() { return undefined; },
    acceptsLanguages() { return ["en"]; },
  } as unknown as Request;
}

interface ReasonFixture {
  // candidateId → which bucket the row was seeded to land in. Includes
  // a "control" entry that should NOT match any reason filter — the
  // happy-path "completed" row.
  byReason: Map<ArchivedReason | "control", string>;
}

let fixture: ReasonFixture | null = null;

async function seedFixture(): Promise<ReasonFixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const oneYearAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
  const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const byReason = new Map<ArchivedReason | "control", string>();

  // (1) inactive_one_year — completed profile, last login stale > 1y.
  // No archived_at (so it's a derived archive, not manual).
  const [r1] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-A-inactive1y-${suffix}`,
    classification: "individual",
    status: "available",
    profileCompleted: true,
    lastLoginAt: oneYearAgo,
  }).returning();
  byReason.set("inactive_one_year", r1.id);

  // (2) incomplete_profile — individual self-signup who never finished
  // the wizard. Profile not completed, no archived_at.
  const [r2] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-B-incomplete-${suffix}`,
    classification: "individual",
    status: "available",
    profileCompleted: false,
  }).returning();
  byReason.set("incomplete_profile", r2.id);

  // (3) missed_activation — SMP worker, never logged in, created > 30
  // days ago so the activation grace window has expired.
  const [r3] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-C-missedact-${suffix}`,
    classification: "smp",
    status: "available",
    profileCompleted: false,
    createdAt: fortyDaysAgo,
  }).returning();
  byReason.set("missed_activation", r3.id);

  // (4) manually_archived — admin pressed Archive. Wins over every
  // derived branch via the leading `archived_at IS NOT NULL` arm.
  const [r4] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-D-manarch-${suffix}`,
    classification: "individual",
    status: "available",
    profileCompleted: true,
    lastLoginAt: tenDaysAgo,
    archivedAt: now,
  }).returning();
  byReason.set("manually_archived", r4.id);

  // (control) completed — recent login, profile done. Must NEVER show
  // up under any archivedReason filter (its ARCHIVED_REASON_SQL projection
  // is NULL, and its display status is "completed").
  const [c0] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-Z-control-${suffix}`,
    classification: "individual",
    status: "available",
    profileCompleted: true,
    lastLoginAt: now,
  }).returning();
  byReason.set("control", c0.id);

  return { byReason };
}

async function tearDownFixture(f: ReasonFixture | null): Promise<void> {
  if (!f) return;
  for (const id of f.byReason.values()) {
    await db.delete(candidates).where(eq(candidates.id, id));
  }
}

before(async () => {
  // Sweep stragglers from any prior aborted run (FIXTURE_MARKER scoped
  // so we never touch real rows). Then mount the production route
  // surface and pull the GET /api/candidates terminal handler — same
  // pattern as smp-commit-iban-resolution / reset-password-flow.
  await db.delete(candidates).where(like(candidates.fullNameEn, `${FIXTURE_MARKER}-%`));

  const { registerRoutes } = await import("../routes");
  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  const router = (app as any).router ?? (app as any)._router;
  const stack = router?.stack ?? [];
  for (const layer of stack) {
    const route = layer.route;
    if (!route || route.path !== "/api/candidates") continue;
    if (!route.methods?.get) continue;
    const subStack = route.stack as Array<{ handle: any }>;
    getCandidatesHandler = subStack[subStack.length - 1].handle;
    break;
  }
  assert.ok(getCandidatesHandler, "could not locate GET /api/candidates handler in router stack");

  fixture = await seedFixture();
  // Sanity: the candidate role exists from boot RBAC seed; we don't
  // create users here, but we touch the table to surface a clearer
  // failure if the test DB is missing the boot seed.
  const role = await db.select({ id: roles.id }).from(roles).limit(1);
  void role;
  void users;
});

after(async () => {
  await tearDownFixture(fixture);
  fixture = null;
});

async function callGetWithReason(reason: ArchivedReason | string): Promise<{
  ids: Set<string>;
  total: number;
}> {
  const cap = makeRes();
  // Pair `archivedReason` with `status=archived` so the implicit
  // `archived_at IS NULL` clause is short-circuited (DERIVED_STATUS_FILTER
  // includes "archived"). Mirrors what the talent page sends — a
  // `?archivedReason=` value alone with no status would silently drop
  // the manually_archived row.
  await getCandidatesHandler(
    makeReq({ query: { archivedReason: reason, status: "archived", limit: "1000" } }),
    cap.res,
  );
  assert.equal(cap.statusCode(), 200, `expected 200, got ${cap.statusCode()} body=${JSON.stringify(cap.body())}`);
  const body = cap.body() as { data: Array<{ id: string }>; total: number };
  return { ids: new Set(body.data.map((r) => r.id)), total: body.total };
}

describe("Task #262 — GET /api/candidates?archivedReason=...", () => {
  for (const reason of ARCHIVED_REASONS) {
    it(`returns the ${reason} fixture and excludes the other three reasons + the control row`, async () => {
      assert.ok(fixture, "fixture must be seeded in `before`");
      const expectedId = fixture!.byReason.get(reason)!;
      const otherIds = new Set(
        Array.from(fixture!.byReason.entries())
          .filter(([k]) => k !== reason)
          .map(([, v]) => v),
      );

      const { ids } = await callGetWithReason(reason);

      assert.ok(
        ids.has(expectedId),
        `expected the seeded ${reason} candidate (${expectedId}) to appear under ?archivedReason=${reason}`,
      );
      for (const otherId of otherIds) {
        assert.equal(
          ids.has(otherId),
          false,
          `?archivedReason=${reason} must not return candidate ${otherId} (which belongs to a different bucket / control)`,
        );
      }
    });
  }

  it("ignores an out-of-set archivedReason value (closed-set guard, no SQL drift)", async () => {
    assert.ok(fixture, "fixture must be seeded in `before`");
    // The handler forwards the raw query value; storage's
    // ARCHIVED_REASON_SET membership check is the closed-set gate.
    // A bogus value must be a no-op — i.e. it falls back to the
    // unfiltered status=archived listing — NOT a 500 / SQL error.
    const cap = makeRes();
    await getCandidatesHandler(
      makeReq({ query: { archivedReason: "not_a_real_reason", status: "archived", limit: "1000" } }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 200, `expected graceful 200 for bogus reason, got ${cap.statusCode()} body=${JSON.stringify(cap.body())}`);
    const body = cap.body() as { data: Array<{ id: string; archivedReason: string | null }> };
    // With the bogus value ignored, every one of our four archived
    // fixture rows should be present (the control "completed" row
    // should NOT, because status=archived already filtered it out).
    const ids = new Set(body.data.map((r) => r.id));
    for (const r of ARCHIVED_REASONS) {
      assert.ok(
        ids.has(fixture!.byReason.get(r)!),
        `bogus reason filter should fall back to all-archived; missing ${r} fixture`,
      );
    }
    assert.equal(
      ids.has(fixture!.byReason.get("control")!),
      false,
      "control 'completed' row must never appear under status=archived",
    );
  });
});
