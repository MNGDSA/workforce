// Task #262 — integration coverage for the POST
// /api/candidates/re-engagement-sms endpoint added in Task #254.
//
// The endpoint is a one-click nudge for candidates that landed in the
// `inactive_one_year` archived sub-bucket (have an account, profile
// complete, but no login in >12 months). It runs three layered
// guards:
//
//   1. RBAC — `candidates:smp_manage` (mirrors the activation-token
//      reissue endpoint).
//   2. Body shape — `ids` MUST be a non-empty array, capped at 500.
//   3. Per-row cohort gate — recompute `computeArchivedReason()` and
//      refuse to nudge anything outside `inactive_one_year`. Also
//      skip rows that are missing a phone or were never activated
//      (no `userId`) — re-engagement only makes sense for activated
//      accounts that we can reach.
//
// Each guard has a distinct failure surface that admin tooling needs
// to be able to distinguish ("not_inactive_one_year" vs "no_phone"
// vs "not_activated"), and a future refactor of the per-row loop or
// the SMS sender wiring could silently collapse them. This file
// drives the real handler against a real DB and asserts the
// breakdown.
//
// IMPORTANT: side-effect contract
// ────────────────────────────────
// The route deliberately bypasses the `sms_outbox` queue and calls
// `sendSmsViaPlugin` synchronously instead — see the comment above
// the route in `routes.ts`:
//
//   "Sent immediately via sendSmsViaPlugin (no outbox row) to mirror
//    the contract-ready / id-card-pickup pattern used for ad-hoc
//    one-shot sends."
//
// So the persistent side-effects we can observe per call are:
//   - exactly ONE `audit_logs` row (action=candidate.re_engagement_sms)
//   - ZERO `sms_outbox` rows for the targeted candidates
//   - one dev-bypass stdout line per happy-path phone (proves the
//     sender was actually invoked — captured via stdout interception
//     in the happy path test below)
//
// All three are asserted explicitly in the happy-path test so a
// future refactor that "helpfully" enqueues an outbox row OR drops
// the audit row OR short-circuits the sender will fail this test.
//
// IMPORTANT: route-mount coverage
// ────────────────────────────────
// `routeStack` below holds the FULL middleware chain registered for
// POST /api/candidates/re-engagement-sms (i.e.,
// `[requirePermission("candidates:smp_manage"), terminalHandler]`).
// `runRouteStack` runs them in order, the way Express does. The
// 403/200 permission tests drive that full chain (NOT just the
// terminal handler) so they prove the actual mounted route enforces
// `candidates:smp_manage`. A regression that mounted the route with
// a different permission key — or with no permission middleware at
// all — would fail those tests.
//
// Run with:
//   NODE_ENV=test npx tsx --test server/__tests__/re-engagement-sms.test.ts

// Force the dev/test bypass in sms-sender so sendSmsViaPlugin returns
// success without making an HTTP call to a real gateway. Done before
// any module import so the bypass is in scope when routes.ts loads.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { and, desc, eq, inArray, like } from "drizzle-orm";

import { db } from "../db";
import { auditLogs, candidates, roles, smsOutbox, users } from "@shared/schema";
import { storage } from "../storage";

const FIXTURE_MARKER = "__t262_reengagement__";

type Middleware = (req: Request, res: Response, next: NextFunction) => any;

// Captured by `before` from the registered express route. Holds the
// full middleware chain — first entry is the `requirePermission(...)`
// guard, last entry is the terminal handler.
let routeStack: Middleware[] = [];

interface CapturedRes {
  res: Response;
  statusCode(): number;
  body(): any;
}

function makeRes(): CapturedRes {
  let statusCode = 200;
  let body: any = undefined;
  let ended = false;
  const res: any = {
    status(code: number) { statusCode = code; return res; },
    json(payload: any) { body = payload; ended = true; return res; },
    setHeader() { return res; },
    send(payload: any) { body = payload; ended = true; return res; },
    get headersSent() { return ended; },
  };
  return {
    res: res as Response,
    statusCode: () => statusCode,
    body: () => body,
  };
}

interface MockReqOpts {
  body?: any;
  userId?: string;
  permissions?: string[];
  isSuperAdmin?: boolean;
}

function makeReq(opts: MockReqOpts = {}): Request {
  return {
    body: opts.body ?? {},
    query: {},
    headers: {},
    params: {},
    ip: "198.51.100.20",
    socket: { remoteAddress: "198.51.100.20" },
    // Simulate post-middleware auth state. requirePermission checks
    // `req.authUserId` first; if set, it skips the inline requireAuth
    // call and goes straight to the perm-set check.
    userId: opts.userId,
    authUserId: opts.userId,
    authPermissions: new Set(opts.permissions ?? ["candidates:smp_manage"]),
    authIsSuperAdmin: opts.isSuperAdmin ?? false,
    get() { return undefined; },
    acceptsLanguages() { return ["en"]; },
  } as unknown as Request;
}

// Walk the captured middleware chain the way Express does: each layer
// either calls `next()` to continue, or terminates the response. If
// any layer terminates without calling next, subsequent layers (and
// the terminal handler) never run — which is exactly the assertion
// the 403 test depends on.
async function runRouteStack(req: Request, res: Response): Promise<{ reachedTerminal: boolean }> {
  let i = 0;
  let reachedTerminal = false;
  const next: NextFunction = async (err?: any) => {
    if (err) throw err;
    const layer = routeStack[i++];
    if (!layer) { reachedTerminal = true; return; }
    if (i === routeStack.length) reachedTerminal = true;
    await layer(req, res, next);
  };
  await next();
  return { reachedTerminal };
}

interface Fixture {
  actorUserId: string;
  // candidate id → label so failure messages stay readable
  candidateIds: {
    happy: string;          // inactive_one_year + userId + phone — should send
    happy2: string;         // second happy-path row, exercises the bulk path
    noPhone: string;        // inactive_one_year + userId, no phone — skip "no_phone"
    notActivated: string;   // inactive_one_year shape but userId IS NULL — skip "not_activated"
    wrongBucket: string;    // recently active, computeArchivedReason returns null — skip "not_inactive_one_year"
    missing: string;        // an UUID with no row — skip "not_found"
  };
  happyPhones: { happy: string; happy2: string };
  cleanupUserIds: string[]; // any user rows we need to delete in `after`
}

let fixture: Fixture | null = null;

// Stub `storage.getActiveSmsPlugin` so the handler finds a "configured"
// plugin without us inserting a real one. The sender itself short-
// circuits to a dev-bypass success because NODE_ENV is forced to
// "test" at the top of this file. Restored in `after`.
const STUB_PLUGIN = {
  id: "stub-plugin-id",
  name: "stub-plugin",
  pluginConfig: {},
  credentials: {},
  isActive: true,
} as any;
const realGetActiveSmsPlugin = (storage as any).getActiveSmsPlugin.bind(storage);

// Capture stdout for the duration of a callback. Used in the happy-
// path test to prove `sendSmsViaPlugin` was actually invoked for each
// targeted phone — its dev-bypass branch logs a deterministic line
// per call ("[SMS Sender] DEV BYPASS — ... for to=<E.164>") which we
// then grep for.
async function captureStdout<T>(fn: () => Promise<T>): Promise<{ result: T; stdout: string }> {
  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: any, ...rest: any[]): boolean => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    return origWrite(chunk, ...rest);
  };
  try {
    const result = await fn();
    return { result, stdout: chunks.join("") };
  } finally {
    (process.stdout as any).write = origWrite;
  }
}

// Convert `05XXXXXXXX` → `966XXXXXXXXX` to match what the dev-bypass
// log line emits (sms-sender normalizes via toE164SaPhone before
// printing). Kept inline so the test stays self-contained.
function toE164(local: string): string {
  if (local.startsWith("05")) return `966${local.slice(1)}`;
  return local;
}

async function seedFixture(): Promise<Fixture> {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const oneYearAgo = new Date(Date.now() - 366 * 24 * 60 * 60 * 1000);
  const now = new Date();

  // Resolve a real role id — users.role_id is NOT NULL.
  const [role] = await db.select({ id: roles.id }).from(roles).limit(1);
  assert.ok(role, "expected at least one role to exist (boot RBAC seed)");

  // Actor user: who logAudit attributes the audit row to. We only
  // need the row to exist so storage.getUser(actorId) resolves and
  // the FK on audit_logs.actor_id is satisfied.
  const [actor] = await db.insert(users).values({
    username: `${FIXTURE_MARKER}-actor-${suffix}`,
    fullName: `${FIXTURE_MARKER}-actor`,
    password: "x",
    roleId: role.id,
    isActive: true,
  }).returning();

  // Two "happy path" candidates linked to throwaway user rows so
  // `cand.userId` is truthy. Phones are random (column has only an
  // index, not a unique constraint).
  const happyPhone = `055${Math.floor(1000000 + Math.random() * 8999999)}`;
  const happy2Phone = `055${Math.floor(1000000 + Math.random() * 8999999)}`;

  const [happyU] = await db.insert(users).values({
    username: `${FIXTURE_MARKER}-happy-${suffix}`,
    fullName: `${FIXTURE_MARKER}-happy`,
    password: "x",
    roleId: role.id,
    isActive: true,
  }).returning();
  const [happy] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-happy-${suffix}`,
    classification: "individual",
    status: "available",
    profileCompleted: true,
    lastLoginAt: oneYearAgo,
    userId: happyU.id,
    phone: happyPhone,
  }).returning();

  const [happy2U] = await db.insert(users).values({
    username: `${FIXTURE_MARKER}-happy2-${suffix}`,
    fullName: `${FIXTURE_MARKER}-happy2`,
    password: "x",
    roleId: role.id,
    isActive: true,
  }).returning();
  const [happy2] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-happy2-${suffix}`,
    classification: "individual",
    status: "available",
    profileCompleted: true,
    lastLoginAt: oneYearAgo,
    userId: happy2U.id,
    phone: happy2Phone,
  }).returning();

  // No-phone variant — userId set, but phone NULL. Handler must skip
  // with reason "no_phone" before reaching the sender.
  const [noPhoneU] = await db.insert(users).values({
    username: `${FIXTURE_MARKER}-nophone-${suffix}`,
    fullName: `${FIXTURE_MARKER}-nophone`,
    password: "x",
    roleId: role.id,
    isActive: true,
  }).returning();
  const [noPhone] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-nophone-${suffix}`,
    classification: "individual",
    status: "available",
    profileCompleted: true,
    lastLoginAt: oneYearAgo,
    userId: noPhoneU.id,
    phone: null,
  }).returning();

  // Not-activated variant — same archive shape, but no linked user
  // row. Handler must skip with reason "not_activated" before the
  // cohort check.
  const [notActivated] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-notact-${suffix}`,
    classification: "individual",
    status: "available",
    profileCompleted: true,
    lastLoginAt: oneYearAgo,
    userId: null,
    phone: `055${Math.floor(1000000 + Math.random() * 8999999)}`,
  }).returning();

  // Wrong-bucket variant — recently active completed profile. Has
  // userId+phone, but `computeArchivedReason` returns null so the
  // cohort gate must skip with reason "not_inactive_one_year".
  const [wrongU] = await db.insert(users).values({
    username: `${FIXTURE_MARKER}-wrong-${suffix}`,
    fullName: `${FIXTURE_MARKER}-wrong`,
    password: "x",
    roleId: role.id,
    isActive: true,
  }).returning();
  const [wrongBucket] = await db.insert(candidates).values({
    fullNameEn: `${FIXTURE_MARKER}-wrong-${suffix}`,
    classification: "individual",
    status: "available",
    profileCompleted: true,
    lastLoginAt: now,
    userId: wrongU.id,
    phone: `055${Math.floor(1000000 + Math.random() * 8999999)}`,
  }).returning();

  return {
    actorUserId: actor.id,
    candidateIds: {
      happy: happy.id,
      happy2: happy2.id,
      noPhone: noPhone.id,
      notActivated: notActivated.id,
      wrongBucket: wrongBucket.id,
      // A syntactically-shaped UUID that no candidate row uses.
      missing: "00000000-0000-0000-0000-000000000000",
    },
    happyPhones: { happy: happyPhone, happy2: happy2Phone },
    cleanupUserIds: [actor.id, happyU.id, happy2U.id, noPhoneU.id, wrongU.id],
  };
}

async function tearDownFixture(f: Fixture | null): Promise<void> {
  if (!f) return;
  const ids = Object.values(f.candidateIds).filter((id) => id !== "00000000-0000-0000-0000-000000000000");
  // Defensive cleanup of any sms_outbox rows that a future regression
  // might have written. The contract is that the route does NOT
  // enqueue, but if someone changes that and forgets to update this
  // file, we don't want stranded rows polluting future runs.
  if (ids.length > 0) {
    await db.delete(smsOutbox).where(inArray(smsOutbox.candidateId, ids));
  }
  for (const id of ids) {
    await db.delete(candidates).where(eq(candidates.id, id));
  }
  await db.delete(auditLogs).where(eq(auditLogs.actorId, f.actorUserId));
  for (const uid of f.cleanupUserIds) {
    await db.delete(users).where(eq(users.id, uid));
  }
}

before(async () => {
  // Sweep stragglers from any prior aborted run (FIXTURE_MARKER scoped).
  await db.delete(candidates).where(like(candidates.fullNameEn, `${FIXTURE_MARKER}-%`));
  await db.delete(users).where(like(users.fullName, `${FIXTURE_MARKER}%`));

  const { registerRoutes } = await import("../routes");
  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  const router = (app as any).router ?? (app as any)._router;
  const stack = router?.stack ?? [];
  for (const layer of stack) {
    const route = layer.route;
    if (!route || route.path !== "/api/candidates/re-engagement-sms") continue;
    if (!route.methods?.post) continue;
    // Capture the FULL middleware chain (not just the terminal
    // handler). For a route mounted as
    //   app.post(path, requirePermission("candidates:smp_manage"), handler)
    // this is exactly [permGuard, handler] — proven by the length
    // assertion below.
    routeStack = (route.stack as Array<{ handle: Middleware }>).map((s) => s.handle);
    break;
  }
  assert.ok(routeStack.length > 0, "could not locate POST /api/candidates/re-engagement-sms route");
  // Pin the chain shape: a future refactor that adds, removes, or
  // reorders middleware on this route will trip this assertion and
  // force the test author to confirm the change is intentional.
  assert.equal(routeStack.length, 2,
    `expected POST /api/candidates/re-engagement-sms to have exactly 2 layers ` +
    `(requirePermission + handler); got ${routeStack.length}. ` +
    `If middleware was added intentionally, update this assertion.`);

  // Stub the active-plugin lookup so the handler proceeds past the
  // early `if (!smsPlugin)` 400. The dev bypass in sendSmsViaPlugin
  // (NODE_ENV=test) means we never actually hit a gateway.
  (storage as any).getActiveSmsPlugin = async () => STUB_PLUGIN;

  fixture = await seedFixture();
});

after(async () => {
  await tearDownFixture(fixture);
  fixture = null;
  (storage as any).getActiveSmsPlugin = realGetActiveSmsPlugin;
});

describe("Task #262 — POST /api/candidates/re-engagement-sms", () => {
  it("happy path: 200, sends to inactive_one_year rows, writes a single audit row, NO sms_outbox enqueue, dev-bypass log proves sender was invoked, breaks down skipped reasons per id", async () => {
    assert.ok(fixture, "fixture must be seeded in `before`");
    const f = fixture!;

    const auditCutoff = new Date();

    const cap = makeRes();
    const { result, stdout } = await captureStdout(async () => {
      return runRouteStack(
        makeReq({
          userId: f.actorUserId,
          body: {
            ids: [
              f.candidateIds.happy,
              f.candidateIds.happy2,
              f.candidateIds.noPhone,
              f.candidateIds.notActivated,
              f.candidateIds.wrongBucket,
              f.candidateIds.missing,
            ],
          },
        }),
        cap.res,
      );
    });
    assert.ok(result.reachedTerminal, "perm guard must allow the request through to the handler");

    assert.equal(cap.statusCode(), 200, `expected 200, got ${cap.statusCode()} body=${JSON.stringify(cap.body())}`);
    const body = cap.body() as {
      sent: number;
      skipped: number;
      failed: number;
      total: number;
      skippedReasons: Array<{ id: string; reason: string }>;
    };

    // 2 inactive_one_year happy rows → 2 sends. The other 4 rows fall
    // through to skipped (4 distinct reasons), 0 failed, total = 6.
    assert.equal(body.sent, 2, `expected 2 sends; got ${body.sent}`);
    assert.equal(body.failed, 0, `expected 0 failed; got ${body.failed}`);
    assert.equal(body.skipped, 4, `expected 4 skipped; got ${body.skipped} (${JSON.stringify(body.skippedReasons)})`);
    assert.equal(body.total, 6);

    // Each skipped row must surface its specific reason — the breakdown
    // is what admin tooling renders to explain "why didn't this nudge
    // go out?". A regression that collapses these into a single bucket
    // would fail this assertion.
    const reasonById = new Map(body.skippedReasons.map((r) => [r.id, r.reason]));
    assert.equal(reasonById.get(f.candidateIds.noPhone), "no_phone");
    assert.equal(reasonById.get(f.candidateIds.notActivated), "not_activated");
    assert.equal(reasonById.get(f.candidateIds.wrongBucket), "not_inactive_one_year");
    assert.equal(reasonById.get(f.candidateIds.missing), "not_found");

    // Sender-invocation contract: the dev-bypass log line proves
    // sendSmsViaPlugin was actually called for both happy rows with
    // the candidate's E.164-normalized phone. A regression that
    // short-circuits the per-row send (e.g. a stray early-return
    // inside the loop) would NOT emit these lines.
    const happyE164 = toE164(f.happyPhones.happy);
    const happy2E164 = toE164(f.happyPhones.happy2);
    assert.ok(stdout.includes(`[SMS Sender] DEV BYPASS`),
      `expected at least one '[SMS Sender] DEV BYPASS' line in stdout; got: ${stdout.slice(0, 400)}`);
    assert.ok(stdout.includes(`for to=${happyE164}`),
      `expected dev-bypass log for happy phone ${happyE164}; got: ${stdout.slice(0, 400)}`);
    assert.ok(stdout.includes(`for to=${happy2E164}`),
      `expected dev-bypass log for happy2 phone ${happy2E164}; got: ${stdout.slice(0, 400)}`);

    // No-outbox contract: the route comment in routes.ts explicitly
    // says "(no outbox row) to mirror the contract-ready / id-card-
    // pickup pattern". Pin that contract: zero rows for any of the
    // candidates we just targeted. A future refactor that moves this
    // route onto the queue must update this assertion deliberately.
    const outboxRows = await db
      .select({ id: smsOutbox.id, candidateId: smsOutbox.candidateId, kind: smsOutbox.kind })
      .from(smsOutbox)
      .where(inArray(smsOutbox.candidateId, [
        f.candidateIds.happy,
        f.candidateIds.happy2,
        f.candidateIds.noPhone,
        f.candidateIds.notActivated,
        f.candidateIds.wrongBucket,
      ]));
    assert.equal(outboxRows.length, 0,
      `re-engagement-sms must NOT enqueue sms_outbox rows; found ${outboxRows.length}: ` +
      JSON.stringify(outboxRows));

    // Audit row was written by the handler (single row, action key
    // matches Task #254's contract). entityId is "bulk" because we
    // sent more than one id.
    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.actorId, f.actorUserId),
        eq(auditLogs.action, "candidate.re_engagement_sms"),
      ))
      .orderBy(desc(auditLogs.createdAt));

    const recent = auditRows.filter((r) => r.createdAt && new Date(r.createdAt) >= auditCutoff);
    assert.equal(recent.length, 1, `expected exactly 1 audit row, got ${recent.length}`);
    const audit = recent[0];
    assert.equal(audit.entityType, "candidate");
    assert.equal(audit.entityId, "bulk");
    const md = audit.metadata as { sent: number; skipped: number; failed: number; total: number } | null;
    assert.ok(md, "audit metadata must be populated");
    assert.equal(md!.sent, 2);
    assert.equal(md!.skipped, 4);
    assert.equal(md!.failed, 0);
    assert.equal(md!.total, 6);
  });

  it("single-id happy path uses the row's id (not 'bulk') as the audit entityId", async () => {
    assert.ok(fixture, "fixture must be seeded in `before`");
    const f = fixture!;
    const auditCutoff = new Date();

    const cap = makeRes();
    const { reachedTerminal } = await runRouteStack(
      makeReq({
        userId: f.actorUserId,
        body: { ids: [f.candidateIds.happy] },
      }),
      cap.res,
    );
    assert.ok(reachedTerminal);
    assert.equal(cap.statusCode(), 200);
    assert.equal((cap.body() as any).sent, 1);

    const audit = await db
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.actorId, f.actorUserId),
        eq(auditLogs.action, "candidate.re_engagement_sms"),
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    assert.ok(audit[0].createdAt && new Date(audit[0].createdAt) >= auditCutoff,
      "expected the latest audit row to be the one we just wrote");
    assert.equal(audit[0].entityId, f.candidateIds.happy,
      "single-id calls must record the actual candidate id (not 'bulk')");
  });

  it("returns 400 when ids is missing or empty (input shape validation)", async () => {
    // Missing ids → 400.
    const cap1 = makeRes();
    await runRouteStack(
      makeReq({ userId: fixture!.actorUserId, body: {} }),
      cap1.res,
    );
    assert.equal(cap1.statusCode(), 400, `missing ids must 400, got ${cap1.statusCode()}`);

    // Empty array → 400 (length === 0 path).
    const cap2 = makeRes();
    await runRouteStack(
      makeReq({ userId: fixture!.actorUserId, body: { ids: [] } }),
      cap2.res,
    );
    assert.equal(cap2.statusCode(), 400, `empty ids array must 400, got ${cap2.statusCode()}`);

    // Non-array ids → 400 (type guard).
    const cap3 = makeRes();
    await runRouteStack(
      makeReq({ userId: fixture!.actorUserId, body: { ids: "not-an-array" } }),
      cap3.res,
    );
    assert.equal(cap3.statusCode(), 400, `non-array ids must 400, got ${cap3.statusCode()}`);
  });

  it("returns 400 when ids exceeds the 500-row bulk cap", async () => {
    // Spec: bulk action limit is 500. 501 must be refused before any
    // per-row work runs (no audit write, no SMS send).
    const big = Array.from({ length: 501 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    const cap = makeRes();
    await runRouteStack(
      makeReq({ userId: fixture!.actorUserId, body: { ids: big } }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400, `>500 ids must 400, got ${cap.statusCode()}`);
  });

  it("the mounted route enforces candidates:smp_manage — caller without the permission gets 403 and never reaches the handler", async () => {
    // This drives the FULL registered middleware chain (the same
    // stack express runs in production), NOT just the terminal
    // handler. Proves three things at once:
    //   (a) the route IS guarded by a permission middleware (not
    //       just by an inline check inside the handler);
    //   (b) the guard rejects callers without `candidates:smp_manage`
    //       (returns 403 with the contract's `required` field);
    //   (c) the terminal handler never runs in that case (no audit
    //       row, no per-row work).
    // A regression that mounts the route with the wrong key, or with
    // no permission middleware at all, fails this test.
    const auditCutoff = new Date();
    const cap = makeRes();
    const actorUserId = fixture!.actorUserId;

    const { reachedTerminal } = await runRouteStack(
      makeReq({
        userId: actorUserId,
        permissions: [], // explicitly empty — does NOT include smp_manage
        isSuperAdmin: false,
        body: { ids: [fixture!.candidateIds.happy] },
      }),
      cap.res,
    );
    assert.equal(reachedTerminal, false,
      "perm guard must short-circuit; the terminal handler MUST NOT run for callers without the permission");
    assert.equal(cap.statusCode(), 403, `expected 403, got ${cap.statusCode()}`);
    const body = cap.body() as { required?: string };
    assert.equal(body.required, "candidates:smp_manage",
      "403 body must echo the required permission key — proves THIS route is mounted with THIS specific guard");

    // Belt-and-suspenders: confirm no audit row was written by the
    // (correctly-skipped) handler. If a future refactor drops the
    // perm middleware but keeps the handler, an audit row would
    // appear here and trip the assertion.
    const audit = await db
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.actorId, actorUserId),
        eq(auditLogs.action, "candidate.re_engagement_sms"),
      ))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    if (audit[0]?.createdAt) {
      assert.ok(new Date(audit[0].createdAt) < auditCutoff,
        "no NEW audit row may be written when the permission guard 403s");
    }
  });

  it("the mounted route lets callers with candidates:smp_manage through to the handler", async () => {
    // Sanity counterpart to the 403 test above: same registered
    // middleware chain, different perm set. Locks the positive
    // branch so a future refactor that accidentally inverts the
    // .has() check fails one of the two.
    const cap = makeRes();
    const { reachedTerminal } = await runRouteStack(
      makeReq({
        userId: fixture!.actorUserId,
        permissions: ["candidates:smp_manage"],
        body: { ids: [fixture!.candidateIds.happy] },
      }),
      cap.res,
    );
    assert.equal(reachedTerminal, true,
      "perm guard must allow callers with candidates:smp_manage through to the terminal handler");
    assert.equal(cap.statusCode(), 200, `expected 200 from terminal handler, got ${cap.statusCode()}`);
  });
});
