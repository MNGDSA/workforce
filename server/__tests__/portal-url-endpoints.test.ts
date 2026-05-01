// Task #263 — integration coverage for the SMS endpoint whose
// `{portal_url}` placeholder used to embed a 404 path suffix:
//   * POST /api/onboarding/reminder-test-sms (returns the rendered
//     preview in its response, so we can assert on it directly)
// Pattern mirrors smp-commit-iban-resolution.test.ts (Task #134):
// real registerRoutes, locate handler in router stack, invoke with
// a pre-authenticated req. The re-engagement endpoint's URL
// emission is covered at the template/unit level in portal-url.test.ts.

process.env.NODE_ENV ??= "test";
const TEST_BASE_URL = "https://workforce.test.example";
process.env.PUBLIC_APP_URL = TEST_BASE_URL;

import { strict as assert } from "node:assert";
import { describe, it, before, beforeEach } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response } from "express";

let reminderTestHandler: (req: Request, res: Response) => Promise<void> | void;

// Storage singleton: typed as a record of async stubs so per-test
// overrides type-check without pulling in the full IStorage shape.
type StorageMethod = (...args: unknown[]) => Promise<unknown>;
type MutableStorage = Record<string, StorageMethod>;
let storageRef: MutableStorage;

before(async () => {
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
  storageRef.createAuditLog = async () => ({ id: "audit-stub" });

  const { registerRoutes } = await import("../routes");
  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  // Pull the handler from the Express router stack so we can invoke
  // it without going through requirePermission (covered by its own
  // tests). Local structural types keep this `any`-free.
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
  assert.ok(reminderTestHandler, "could not locate POST /api/onboarding/reminder-test-sms in router stack");
});

beforeEach(() => {
  // Re-install the default (active) SMS plugin in case a prior test
  // swapped it out for the no-plugin branch.
  storageRef.getActiveSmsPlugin = async () => ({
    id: "plugin-test",
    name: "test-gateway",
    pluginConfig: { url: "https://invalid.test/never-called" },
    credentials: {},
    isActive: true,
  });
});

interface CapturedRes {
  res: Response;
  statusCode(): number;
  body(): unknown;
}
function makeRes(): CapturedRes {
  let statusCode = 200;
  let body: unknown = undefined;
  // Subset of express.Response the handler actually calls.
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
// have produced if the SUPER-ADMIN passed through.
function makeAuthedReq(body: unknown): Request {
  return {
    authUserId: "test-actor",
    authIsSuperAdmin: true,
    authPermissions: new Set(["onboarding:update"]),
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
    assert.equal(captured.statusCode(), 200, `expected 200, got ${captured.statusCode()} body=${JSON.stringify(captured.body())}`);
    const body = captured.body() as { ok: boolean; preview: string };
    assert.equal(body.ok, true);
    assert.ok(body.preview.includes(TEST_BASE_URL), `preview must contain bare base URL ${TEST_BASE_URL}, got: ${body.preview}`);
    assert.ok(!body.preview.includes("/candidate/onboarding"), `preview leaked /candidate/onboarding suffix: ${body.preview}`);
    assert.ok(!body.preview.includes("/login"), `preview leaked /login suffix: ${body.preview}`);
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
  });

  it("falls back to the wire-message preview on a 503 when the SMS plugin is unconfigured", async () => {
    storageRef.getActiveSmsPlugin = async () => null;
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
  });
});
