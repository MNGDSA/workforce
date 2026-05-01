// Task #277 — real-DB integration coverage for the payment-method
// PATCH 409 BLOCKED path.
//
// The sibling `payment-method-flip-block.test.ts` pins the route's
// response contract by mounting a tiny Express harness whose handler
// body mirrors the production route line-for-line and a fake storage
// layer that returns each discriminated branch. That test is fast and
// cheap, but it cannot catch a regression where:
//
//   • `updateWorkforcePaymentMethodGuarded` stops returning the
//     `{ ok: false, blocked: true, openLines: [...] }` discriminant
//     when there really are open pay-run lines (e.g. a future Drizzle
//     refactor accidentally drops the OR-branch on tranche2Status);
//   • the production route stops mapping that branch to HTTP 409 with
//     `code: "OPEN_PAY_RUN_LINES"` and an `openLines` array carrying
//     a `lineId` per row;
//   • the no-op same-method PATCH starts spuriously 409-ing because
//     the storage helper drops its `newMethod !== previousMethod`
//     short-circuit.
//
// This test seeds a real candidate + workforce employee + draft pay
// run + open pay-run line through the actual Drizzle schema, mounts
// the production routes via `registerRoutes`, pulls the PATCH
// /api/workforce/:id/payment-method handler out of the router stack,
// and exercises both branches end-to-end against a live Postgres.
//
// Run with:
//   npx tsx --test server/__tests__/payment-method-flip-block-db.test.ts

import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response } from "express";
import { eq, like, inArray } from "drizzle-orm";

import { db } from "../db";
import {
  candidates,
  workforce,
  payRuns,
  payRunLines,
  auditLogs,
} from "@shared/schema";

const FIXTURE_MARKER = "__t277_pm_flip_block__";

type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

let patchPaymentMethodHandler: RouteHandler;

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

function makeReq(opts: { params?: any; body?: any } = {}): Request {
  return {
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: {},
    // tr() reads `accept-language`/`x-locale` from headers and falls
    // back to DEFAULT_LOCALE; an empty headers object is fine.
    headers: {},
    ip: "198.51.100.20",
    socket: { remoteAddress: "198.51.100.20" },
    // The terminal handler reads getAuthUserId(req) for the audit
    // log; with no cookie/Authorization header it returns null and
    // logAudit records the action under the System actor.
    get() { return undefined; },
    acceptsLanguages() { return ["en"]; },
  } as unknown as Request;
}

interface Fixture {
  candidateId: string;
  workforceId: string;
  employeeNumber: string;
  payRunId: string;
  payRunLineId: string;
}

async function seedFixture(): Promise<Fixture> {
  // The 7-digit employee_number column is uniquely indexed; we pick a
  // suffix from the current millisecond timestamp so re-running the
  // test back-to-back doesn't collide. The leading digit "9" pushes
  // the value far above any production-issued number, and the marker
  // on the candidate name keeps the sweep query in `before` precise.
  const empSuffix = String(Date.now() % 1_000_000).padStart(6, "0");
  const employeeNumber = `9${empSuffix}`;

  const [cand] = await db
    .insert(candidates)
    .values({
      fullNameEn: `${FIXTURE_MARKER}-cand-${empSuffix}`,
      classification: "individual",
      status: "available",
      profileCompleted: true,
    })
    .returning();

  const [wf] = await db
    .insert(workforce)
    .values({
      employeeNumber,
      candidateId: cand.id,
      startDate: "2026-01-01",
      isActive: true,
      paymentMethod: "bank_transfer",
      salary: "5000.00",
    })
    .returning();

  // A `draft` pay run holding one `pending` tranche-1 line. The
  // storage guard treats anything whose pay_run.status != 'completed'
  // and whose tranche1Status OR tranche2Status is 'pending' as "open"
  // — the simplest open shape is exactly this row.
  const [run] = await db
    .insert(payRuns)
    .values({
      name: `${FIXTURE_MARKER} March 2026`,
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      mode: "full",
      status: "draft",
    })
    .returning();

  const [line] = await db
    .insert(payRunLines)
    .values({
      payRunId: run.id,
      workforceId: wf.id,
      candidateId: cand.id,
      employeeNumber,
      effectiveDateFrom: "2026-03-01",
      effectiveDateTo: "2026-03-31",
      baseSalary: "5000.00",
      tranche1Status: "pending",
      paymentMethod: "bank_transfer",
    })
    .returning();

  return {
    candidateId: cand.id,
    workforceId: wf.id,
    employeeNumber,
    payRunId: run.id,
    payRunLineId: line.id,
  };
}

async function tearDownFixture(f: Fixture | null): Promise<void> {
  if (!f) return;
  // pay_run_lines cascade-delete with the pay_run; we still issue an
  // explicit delete first so that a future schema change weakening
  // that FK does not turn this teardown into a silent leak.
  await db.delete(payRunLines).where(eq(payRunLines.payRunId, f.payRunId));
  await db.delete(payRuns).where(eq(payRuns.id, f.payRunId));
  await db.delete(auditLogs).where(eq(auditLogs.entityId, f.workforceId));
  await db.delete(workforce).where(eq(workforce.id, f.workforceId));
  await db.delete(candidates).where(eq(candidates.id, f.candidateId));
}

let fixture: Fixture | null = null;

before(async () => {
  // Sweep stragglers from any prior aborted run. FIXTURE_MARKER scopes
  // the candidate sweep precisely; for workforce/pay_runs we then use
  // the resulting candidate ids (if any) so we never touch unrelated
  // rows.
  const stragglers = await db
    .select({ id: candidates.id })
    .from(candidates)
    .where(like(candidates.fullNameEn, `${FIXTURE_MARKER}-%`));
  if (stragglers.length > 0) {
    const ids = stragglers.map((r) => r.id);
    const wfRows = await db
      .select({ id: workforce.id })
      .from(workforce)
      .where(inArray(workforce.candidateId, ids));
    const wfIds = wfRows.map((r) => r.id);
    if (wfIds.length > 0) {
      const lineRows = await db
        .select({ payRunId: payRunLines.payRunId })
        .from(payRunLines)
        .where(inArray(payRunLines.workforceId, wfIds));
      const runIds = Array.from(new Set(lineRows.map((r) => r.payRunId)));
      if (runIds.length > 0) {
        await db.delete(payRunLines).where(inArray(payRunLines.payRunId, runIds));
        await db.delete(payRuns).where(inArray(payRuns.id, runIds));
      }
      await db.delete(auditLogs).where(inArray(auditLogs.entityId, wfIds));
      await db.delete(workforce).where(inArray(workforce.id, wfIds));
    }
    await db.delete(candidates).where(inArray(candidates.id, ids));
  }

  // Mount the production route surface and pull the PATCH
  // /api/workforce/:id/payment-method terminal handler — same pattern
  // as talent-archived-reason / smp-commit-iban-resolution. The
  // requirePermission middleware sits earlier in the route's stack;
  // grabbing the LAST entry skips it (auth is layered above this
  // contract test by design — RBAC is exercised separately).
  const { registerRoutes } = await import("../routes");
  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  const router = (app as any).router ?? (app as any)._router;
  const stack = router?.stack ?? [];
  for (const layer of stack) {
    const route = layer.route;
    if (!route || route.path !== "/api/workforce/:id/payment-method") continue;
    if (!route.methods?.patch) continue;
    const subStack = route.stack as Array<{ handle: any }>;
    patchPaymentMethodHandler = subStack[subStack.length - 1].handle;
    break;
  }
  assert.ok(
    patchPaymentMethodHandler,
    "could not locate PATCH /api/workforce/:id/payment-method handler in router stack",
  );

  fixture = await seedFixture();
});

after(async () => {
  await tearDownFixture(fixture);
  fixture = null;
});

describe("Task #277 — PATCH /api/workforce/:id/payment-method (real DB)", () => {
  it("returns HTTP 409 with code=OPEN_PAY_RUN_LINES and the open line listed when an open pay-run line exists", async () => {
    assert.ok(fixture, "fixture must be seeded in `before`");
    const cap = makeRes();
    await patchPaymentMethodHandler(
      makeReq({
        params: { id: fixture!.workforceId },
        body: { paymentMethod: "cash", reason: "switch by request" },
      }),
      cap.res,
    );

    assert.equal(
      cap.statusCode(),
      409,
      `expected 409, got ${cap.statusCode()} body=${JSON.stringify(cap.body())}`,
    );
    const body = cap.body() as {
      error: string;
      code: string;
      openLines: Array<{
        lineId: string;
        payRunId: string;
        payRunName: string;
        payRunStatus: string;
        tranche1Status: string | null;
        tranche2Status: string | null;
        paymentMethod: string;
      }>;
    };
    assert.equal(body.code, "OPEN_PAY_RUN_LINES",
      "the discriminator the React PaymentMethodToggle reads must stay stable");
    assert.equal(typeof body.error, "string");
    assert.ok(body.error.length > 0, "error message must be a non-empty translated string");
    assert.ok(Array.isArray(body.openLines), "openLines must be an array");
    assert.ok(body.openLines.length >= 1, "at least the seeded open line must surface");

    const seededLine = body.openLines.find((l) => l.lineId === fixture!.payRunLineId);
    assert.ok(seededLine, "the seeded open pay-run line must be present in openLines");
    assert.equal(seededLine!.payRunId, fixture!.payRunId);
    assert.equal(seededLine!.payRunStatus, "draft");
    assert.equal(seededLine!.tranche1Status, "pending");
    assert.equal(seededLine!.paymentMethod, "bank_transfer");
    assert.ok(typeof seededLine!.payRunName === "string" && seededLine!.payRunName.length > 0);
  });

  it("does NOT mutate the workforce row or audit log when the PATCH is blocked", async () => {
    assert.ok(fixture, "fixture must be seeded in `before`");
    // Self-contained: issue our own blocked PATCH inside this test so
    // the assertion does not depend on prior-test ordering. The
    // storage helper opens its own transaction; if the guard short-
    // circuits correctly, neither workforce.paymentMethod nor
    // audit_logs should observe a write.
    const beforeAudits = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, fixture!.workforceId));

    const cap = makeRes();
    await patchPaymentMethodHandler(
      makeReq({
        params: { id: fixture!.workforceId },
        body: { paymentMethod: "cash", reason: "second blocked attempt" },
      }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 409,
      `expected blocked PATCH to 409, got ${cap.statusCode()} body=${JSON.stringify(cap.body())}`);

    const [row] = await db
      .select({ paymentMethod: workforce.paymentMethod })
      .from(workforce)
      .where(eq(workforce.id, fixture!.workforceId));
    assert.equal(row.paymentMethod, "bank_transfer",
      "blocked PATCH must not have flipped the stored paymentMethod");

    const afterAudits = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, fixture!.workforceId));
    assert.equal(afterAudits.length, beforeAudits.length,
      "blocked PATCH must not have written an update_payment_method audit entry");
  });

  it("returns HTTP 200 on a no-op PATCH (same paymentMethod) even though open pay-run lines still exist", async () => {
    assert.ok(fixture, "fixture must be seeded in `before`");
    const cap = makeRes();
    await patchPaymentMethodHandler(
      makeReq({
        params: { id: fixture!.workforceId },
        body: { paymentMethod: "bank_transfer" },
      }),
      cap.res,
    );

    assert.equal(
      cap.statusCode(),
      200,
      `expected 200 (no-op), got ${cap.statusCode()} body=${JSON.stringify(cap.body())}`,
    );
    const body = cap.body() as { id: string; paymentMethod: string };
    assert.equal(body.id, fixture!.workforceId);
    assert.equal(body.paymentMethod, "bank_transfer");

    // The open line is still in place, so a follow-up TRUE flip must
    // still be blocked. This pins that the no-op success path did not
    // accidentally clear/mark the open line as resolved.
    const remainingOpen = await db
      .select({ id: payRunLines.id })
      .from(payRunLines)
      .where(eq(payRunLines.id, fixture!.payRunLineId));
    assert.equal(remainingOpen.length, 1,
      "no-op PATCH must not delete or reassign the open pay-run line");
  });
});
