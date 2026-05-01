// Task #263 — endpoint-level integration coverage for the two SMS
// endpoints whose `{portal_url}` placeholder used to embed a 404
// path suffix (`/candidate/onboarding` / `/login`):
//
//   * POST /api/onboarding/reminder-test-sms
//   * POST /api/candidates/re-engagement-sms
//
// These tests exercise the REAL handlers registered via
// `registerRoutes(httpServer, app)` — same pattern as
// `smp-commit-iban-resolution.test.ts` for Task #134. The handlers
// are located in the live router stack and invoked directly with a
// pre-authenticated `req` object so we bypass auth middleware
// (covered by its own tests) without simulating a full login flow.
//
// Storage is stubbed at the singleton level so the handlers see a
// known SMS plugin and a single inactive_one_year candidate. The
// SMS gateway is intercepted via the `__test__.setSendInterceptor`
// hook in `server/sms-sender.ts`, which captures every `(to,
// message)` pair the production code path is about to send. The
// captured message text is then asserted to (a) contain the bare
// resolved base URL, and (b) NOT contain the offending suffix.
//
// Run with:
//   npx tsx --test server/__tests__/portal-url-endpoints.test.ts

// Default NODE_ENV to "test" so the portal-url helper's
// REPLIT_DEV_DOMAIN gate accepts our explicit PUBLIC_APP_URL path
// and so the SMS sender's dev-bypass is active (no real HTTP call).
process.env.NODE_ENV ??= "test";
// Pin a deterministic base URL the assertions can grep for.
const TEST_BASE_URL = "https://workforce.test.example";
process.env.PUBLIC_APP_URL = TEST_BASE_URL;

import { strict as assert } from "node:assert";
import { describe, it, before, beforeEach, afterEach } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response } from "express";

let reminderTestHandler: (req: Request, res: Response) => Promise<void> | void;
let reengagementHandler: (req: Request, res: Response) => Promise<void> | void;

// Storage singleton lookup — populated lazily so the import order
// matches what registerRoutes expects. We type it as a record of
// async function stubs that the two handlers under test invoke;
// `unknown` would force every callsite to narrow, and the actual
// `IStorage` interface defines hundreds of unrelated methods we
// don't need to replicate just to swap three of them. The `as
// MutableStorage` cast at the boundary is the deliberate seam.
type StorageMethod = (...args: unknown[]) => Promise<unknown>;
type MutableStorage = Record<string, StorageMethod>;
let storageRef: MutableStorage;
let smsTestHooks: { setSendInterceptor(fn: ((to: string, message: string) => void) | null): void };

// What the stubbed `storage.getCandidate` returns for our test rows.
// Mutable per-test via `seedCandidate(...)`. The shape mirrors only
// the candidate fields the handlers and the cohort gate inspect —
// adding extra fields here is harmless because the handler reads by
// property access, but we keep the index signature open so future
// fields can be set per-test without widening this type.
type SeededCandidate = Record<string, unknown> & {
  id: string;
  userId: string | null;
  phone: string | null;
  profileCompleted?: boolean;
  lastLoginAt?: Date | string | null;
  archivedAt?: Date | string | null;
};
let seededCandidate: SeededCandidate | null = null;
function seedCandidate(c: SeededCandidate | null) { seededCandidate = c; }

// Capture every SMS the handler tries to send.
const sentMessages: Array<{ to: string; message: string }> = [];

before(async () => {
  // Pool() in db.ts needs a string but does NOT connect until first
  // query. Most stubbed methods short-circuit before any DB call.
  process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";

  const storageMod = await import("../storage");
  storageRef = storageMod.storage as unknown as MutableStorage;

  // Active SMS plugin — minimal shape sufficient for sendSmsViaPlugin
  // to take the dev-bypass path (NODE_ENV=test).
  storageRef.getActiveSmsPlugin = async () => ({
    id: "plugin-test",
    name: "test-gateway",
    pluginConfig: { url: "https://invalid.test/never-called" },
    credentials: {},
    isActive: true,
  });

  storageRef.getCandidate = async (id: string) => {
    if (seededCandidate && seededCandidate.id === id) return seededCandidate;
    return null;
  };

  // The audit log writer is invoked at the end of each handler. Stub
  // so a missing DB doesn't surface as a 500.
  storageRef.createAuditLog = async () => ({ id: "audit-stub" });

  // Hook the SMS sender's test-only interceptor so we can capture
  // exactly what the handler hands to the gateway.
  const smsMod = await import("../sms-sender");
  smsTestHooks = smsMod.__test__;

  const { registerRoutes } = await import("../routes");
  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  // Pull the two handlers out of the Express router stack so we can
  // invoke them without going through requirePermission. Auth is
  // covered by auth-middleware tests; the bug under test is in the
  // handler body's URL-emission code.
  // Express's router stack is private API — there is no public way
  // to fetch a handler by route+method. We narrow the access to a
  // local structural type so the rest of the file stays `any`-free.
  type RouteLayer = {
    route?: {
      path: string;
      methods?: Record<string, boolean>;
      stack: Array<{ handle: (req: Request, res: Response) => Promise<void> | void }>;
    };
  };
  type AppWithRouter = Express & {
    router?: { stack: RouteLayer[] };
    _router?: { stack: RouteLayer[] };
  };
  const router = (app as AppWithRouter).router ?? (app as AppWithRouter)._router;
  const stack: RouteLayer[] = router?.stack ?? [];
  const findHandler = (method: "post", path: string) => {
    for (const layer of stack) {
      const route = layer.route;
      if (!route || route.path !== path) continue;
      if (!route.methods?.[method]) continue;
      const sub = route.stack;
      return sub[sub.length - 1].handle;
    }
    return null;
  };
  reminderTestHandler = findHandler("post", "/api/onboarding/reminder-test-sms");
  reengagementHandler = findHandler("post", "/api/candidates/re-engagement-sms");
  assert.ok(reminderTestHandler, "could not locate POST /api/onboarding/reminder-test-sms in router stack");
  assert.ok(reengagementHandler, "could not locate POST /api/candidates/re-engagement-sms in router stack");
});

beforeEach(() => {
  sentMessages.length = 0;
  seededCandidate = null;
  smsTestHooks.setSendInterceptor((to, message) => {
    sentMessages.push({ to, message });
  });
});
afterEach(() => {
  smsTestHooks.setSendInterceptor(null);
});

// Minimal Express-shaped response double — only the methods the
// real handlers invoke. Returns accessor closures so each test
// reads `res.statusCode()` / `res.body()` like supertest.
interface CapturedRes {
  res: Response;
  statusCode(): number;
  body(): unknown;
}
function makeRes(): CapturedRes {
  let statusCode = 200;
  let body: unknown = undefined;
  // Subset of express.Response the two handlers actually call.
  // Keeping the type local + structural avoids importing Express's
  // huge Response interface just to assert on three methods.
  interface MinimalRes {
    status(code: number): MinimalRes;
    json(payload: unknown): MinimalRes;
    setHeader(name: string, value: string): MinimalRes;
  }
  const r: MinimalRes = {
    status(code: number) { statusCode = code; return r; },
    json(payload: unknown) { body = payload; return r; },
    setHeader() { return r; },
  };
  return {
    res: r as unknown as Response,
    statusCode: () => statusCode,
    body: () => body,
  };
}

// Build a `req` shaped like what requireAuth/requirePermission would
// have produced if the SUPER-ADMIN passed through. The handlers under
// test only read these fields and `body`/`headers`.
function makeAuthedReq(body: unknown): Request {
  return {
    authUserId: "test-actor",
    authIsSuperAdmin: true,
    authPermissions: new Set([
      "candidates:smp_manage",
      "onboarding:update",
    ]),
    body,
    headers: {},
    cookies: {},
    query: {},
    params: {},
  } as unknown as Request;
}

describe("POST /api/onboarding/reminder-test-sms — real route, bare {portal_url}", () => {
  it("rendered preview embeds the bare base URL with NO 404 path suffix (en + regular)", async () => {
    const captured = makeRes();
    await reminderTestHandler(
      makeAuthedReq({ phone: "0500000001", variant: "regular", locale: "en" }),
      captured.res,
    );
    // Plugin returns dev-bypass success in test env, so 200.
    assert.equal(captured.statusCode(), 200, `expected 200, got ${captured.statusCode()} body=${JSON.stringify(captured.body())}`);
    const body = captured.body() as { ok: boolean; preview: string };
    assert.equal(body.ok, true);
    assert.ok(body.preview.includes(TEST_BASE_URL), `preview must contain bare base URL ${TEST_BASE_URL}, got: ${body.preview}`);
    assert.ok(!body.preview.includes("/candidate/onboarding"), `preview leaked /candidate/onboarding suffix: ${body.preview}`);
    assert.ok(!body.preview.includes("/login"), `preview leaked /login suffix: ${body.preview}`);
    // The interceptor must also have been called with the SAME
    // message the response surfaced — proves the wire payload and
    // the operator-visible preview agree.
    assert.equal(sentMessages.length, 1, `expected one captured SMS, got ${sentMessages.length}`);
    assert.equal(sentMessages[0].message, body.preview, "captured wire message must equal preview");
  });

  it("rendered preview embeds the bare base URL with NO 404 path suffix (ar + final)", async () => {
    const captured = makeRes();
    await reminderTestHandler(
      makeAuthedReq({ phone: "0500000002", variant: "final", locale: "ar" }),
      captured.res,
    );
    assert.equal(captured.statusCode(), 200);
    const body = captured.body() as { ok: boolean; preview: string };
    assert.ok(body.preview.includes(TEST_BASE_URL), `preview must contain bare base URL: ${body.preview}`);
    assert.ok(!body.preview.includes(`${TEST_BASE_URL}/candidate`), `preview leaked /candidate suffix: ${body.preview}`);
    assert.ok(!body.preview.includes(`${TEST_BASE_URL}/login`), `preview leaked /login suffix: ${body.preview}`);
    assert.equal(sentMessages.length, 1);
  });

  it("falls back to the wire-message preview on a 503 when the SMS plugin is unconfigured", async () => {
    // Temporarily remove the plugin to drive the no-plugin branch
    // (returns 503 with the constructed preview).
    const restore = storageRef.getActiveSmsPlugin;
    storageRef.getActiveSmsPlugin = async () => null;
    try {
      const captured = makeRes();
      await reminderTestHandler(
        makeAuthedReq({ phone: "0500000003", variant: "regular", locale: "en" }),
        captured.res,
      );
      assert.equal(captured.statusCode(), 503);
      const body = captured.body() as { ok: boolean; preview: string; error: string };
      assert.equal(body.error, "no_active_sms_plugin");
      assert.ok(body.preview.includes(TEST_BASE_URL), `503 preview must contain bare base URL: ${body.preview}`);
      assert.ok(!body.preview.includes("/candidate/onboarding"), `503 preview leaked /candidate/onboarding: ${body.preview}`);
    } finally {
      storageRef.getActiveSmsPlugin = restore;
    }
  });
});

describe("POST /api/candidates/re-engagement-sms — real route, bare {portal_url}", () => {
  it("captured wire message embeds the bare base URL with NO /login suffix (en candidate)", async () => {
    // Seed a candidate the cohort gate accepts. The gate calls
    // `computeArchivedReason` (in shared/candidate-status.ts), which
    // returns "inactive_one_year" iff:
    //   * archivedAt is null
    //   * status is not blocked / not hired
    //   * profileCompleted === true
    //   * lastLoginAt is either null OR more than 365 days ago
    // Phone + userId are needed independently so the route's
    // own pre-checks (account exists, has a number to text) pass.
    const yearAgo = new Date(Date.now() - 400 * 24 * 3600_000);
    seedCandidate({
      id: "cand-en-1",
      userId: "user-en-1",
      phone: "0500000010",
      classification: "smp",
      status: "active",
      profileCompleted: true,
      lastLoginAt: yearAgo,
      archivedAt: null,
      preferredLocale: "en",
    });

    const captured = makeRes();
    await reengagementHandler(
      makeAuthedReq({ ids: ["cand-en-1"] }),
      captured.res,
    );

    assert.equal(captured.statusCode(), 200, `expected 200, got ${captured.statusCode()} body=${JSON.stringify(captured.body())}`);
    const body = captured.body() as { sent: number; skipped: number; failed: number; total: number; skippedReasons: Array<{ id: string; reason: string }> };
    if (body.sent !== 1) {
      // Surface why the cohort gate rejected so the test message is actionable.
      assert.fail(`expected sent=1 — got ${JSON.stringify(body)}`);
    }
    assert.equal(sentMessages.length, 1, `expected one captured SMS, got ${sentMessages.length}: ${JSON.stringify(sentMessages)}`);
    const msg = sentMessages[0].message;
    assert.ok(msg.includes(TEST_BASE_URL), `wire message must contain bare base URL: ${msg}`);
    assert.ok(!msg.includes("/login"), `wire message leaked /login suffix: ${msg}`);
    assert.ok(!msg.includes("/candidate"), `wire message leaked /candidate suffix: ${msg}`);
    // Exactly one URL occurrence guards against accidental
    // double-substitution in the i18n template.
    const occurrences = msg.match(new RegExp(TEST_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length ?? 0;
    assert.equal(occurrences, 1, `expected exactly one URL occurrence, got ${occurrences}: ${msg}`);
  });

  it("captured wire message embeds the bare base URL with NO /login suffix (ar candidate)", async () => {
    const yearAgo = new Date(Date.now() - 400 * 24 * 3600_000);
    seedCandidate({
      id: "cand-ar-1",
      userId: "user-ar-1",
      phone: "0500000011",
      classification: "smp",
      status: "active",
      profileCompleted: true,
      lastLoginAt: yearAgo,
      archivedAt: null,
      preferredLocale: "ar",
    });

    const captured = makeRes();
    await reengagementHandler(
      makeAuthedReq({ ids: ["cand-ar-1"] }),
      captured.res,
    );

    assert.equal(captured.statusCode(), 200, `expected 200, got ${captured.statusCode()} body=${JSON.stringify(captured.body())}`);
    const body = captured.body() as { sent: number; skippedReasons: Array<{ id: string; reason: string }> };
    if (body.sent !== 1) {
      assert.fail(`expected sent=1 — got ${JSON.stringify(body)}`);
    }
    assert.equal(sentMessages.length, 1);
    const msg = sentMessages[0].message;
    assert.ok(msg.includes(TEST_BASE_URL), `ar wire message must contain bare base URL: ${msg}`);
    assert.ok(!msg.includes("/login"), `ar wire message leaked /login suffix: ${msg}`);
  });

  it("returns 400 when ids is empty (input validation untouched)", async () => {
    const captured = makeRes();
    await reengagementHandler(
      makeAuthedReq({ ids: [] }),
      captured.res,
    );
    assert.equal(captured.statusCode(), 400);
    assert.equal(sentMessages.length, 0);
  });

  it("skips not_inactive_one_year candidates without sending", async () => {
    // Active candidate (lastSeenAt = now) — cohort gate must reject
    // the row and the SMS interceptor must NOT fire.
    seedCandidate({
      id: "cand-active",
      userId: "user-active",
      phone: "0500000012",
      classification: "smp",
      status: "active",
      profileCompleted: true,
      lastLoginAt: new Date(),
      archivedAt: null,
      preferredLocale: "en",
    });
    const captured = makeRes();
    await reengagementHandler(
      makeAuthedReq({ ids: ["cand-active"] }),
      captured.res,
    );
    assert.equal(captured.statusCode(), 200);
    const body = captured.body() as { sent: number; skipped: number };
    assert.equal(body.sent, 0);
    assert.equal(body.skipped, 1);
    assert.equal(sentMessages.length, 0, "active candidate must not receive a re-engagement SMS");
  });
});
