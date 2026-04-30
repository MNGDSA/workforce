// Task #232 — regression coverage for the reminder-settings PUT
// validator that broke saving entirely.
//
// Two server-side validation gaps caused every save to 400:
//
//   1. The PUT body validator uses `.strict()` and did NOT list
//      `enabledAt`. The GET response includes `enabledAt` (a
//      server-managed timestamp stamped on OFF→ON transitions), the
//      client spreads the GET response into form state, and POSTs the
//      whole shape back on save. Strict-mode rejected the unknown
//      key with "Unrecognized key(s) in object: 'enabledAt'".
//
//   2. The doc enum was `["photo", "iban", "national_id"]` — missing
//      `"vaccination_report"` even though the client default and the
//      server DEFAULT_CONFIG both include it as the 4th required
//      document. The first error short-circuited validation in the
//      original failure mode, masking this one until #1 was fixed.
//
// This file pins:
//   - GET → PUT round-trip with the unmodified GET payload (incl.
//     `enabledAt: null` and `requiredDocs: [..., "vaccination_report"]`)
//     returns 200 and persists the full requiredDocs list.
//   - The client's `enabledAt` value is IGNORED on PUT — the server
//     sets it on OFF→ON transitions and clears it on ON→OFF, never
//     trusting whatever the client sent.
//   - `requiredDocs` containing all four docs is accepted (validator
//     no longer 400s on "vaccination_report").
//
// Run with:
//   npx tsx --test server/__tests__/reminder-settings-save.test.ts

import { strict as assert } from "node:assert";
import { describe, it, before, after } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response } from "express";

import { storage } from "../storage";
import { setReminderConfig, getReminderConfig } from "../onboarding-reminders";

type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

const handlers: Record<string, RouteHandler> = {};

interface CapturedRes {
  res: Response;
  statusCode(): number;
  body(): unknown;
}

function makeRes(): CapturedRes {
  let statusCode = 200;
  let body: unknown = undefined;
  const res: any = {
    status(code: number) { statusCode = code; return res; },
    json(payload: unknown) { body = payload; return res; },
    setHeader() { return res; },
    send(payload: unknown) { body = payload; return res; },
  };
  return {
    res: res as Response,
    statusCode: () => statusCode,
    body: () => body,
  };
}

function makeReq(opts: { body?: unknown; method?: string } = {}): Request {
  return {
    method: opts.method ?? "PUT",
    body: opts.body ?? {},
    headers: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    get() { return undefined; },
    acceptsLanguages() { return ["en"]; },
    // The PUT handler calls logAudit, which reads several req.auth*
    // fields the upstream middleware would have populated. Provide
    // safe defaults so the handler doesn't throw on undefined.
    authUserId: null,
    authPermissions: new Set<string>(),
    authIsSuperAdmin: true,
  } as unknown as Request;
}

// Snapshot of the system_settings row we mutate, so we can put the
// dev DB back exactly the way we found it after the suite runs.
let priorRawConfig: string | undefined;

before(async () => {
  // Mount the real registerRoutes onto a throwaway Express app and
  // pull the GET + PUT handlers off the router stack — same pattern
  // server/__tests__/reset-password-flow.test.ts uses.
  const { registerRoutes } = await import("../routes");
  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  const router = (app as any).router ?? (app as any)._router;
  const stack = router?.stack ?? [];
  const wanted = new Map<string, string>([
    ["GET /api/onboarding/reminder-settings", "get"],
    ["PUT /api/onboarding/reminder-settings", "put"],
  ]);
  for (const layer of stack) {
    const route = layer.route;
    if (!route) continue;
    for (const method of Object.keys(route.methods ?? {})) {
      const key = `${method.toUpperCase()} ${route.path}`;
      const slot = wanted.get(key);
      if (!slot) continue;
      const subStack = route.stack as Array<{ handle: any }>;
      // Use the LAST handler in the chain — that's the route handler
      // proper, after the requirePermission middleware.
      handlers[slot] = subStack[subStack.length - 1].handle;
    }
  }
  for (const [key, slot] of wanted) {
    assert.ok(handlers[slot], `could not locate ${key} handler in router stack`);
  }

  priorRawConfig = (await storage.getSystemSetting("onboarding_reminder_config")) ?? undefined;
});

after(async () => {
  // Put the system_settings row back to whatever was there before the
  // suite ran (or clear it if there was nothing).
  if (priorRawConfig === undefined) {
    await storage.setSystemSetting("onboarding_reminder_config", "");
  } else {
    await storage.setSystemSetting("onboarding_reminder_config", priorRawConfig);
  }
});

describe("reminder-settings PUT validator (task #232)", () => {
  it("accepts the unmodified GET-shape body — including a real enabledAt timestamp and vaccination_report", async () => {
    // Set the persisted config to a known starting point: enabled
    // already true, so its `enabledAt` is a non-null string and the
    // PUT round-trip exercises the "client echoes a real timestamp
    // back" path — the strongest case, since the strict() validator
    // would 400 on it before this fix.
    //
    // First force OFF so the next `enabled: true` is a real OFF→ON
    // transition that stamps a fresh enabledAt — the dev DB may already
    // have enabled=true from a prior run, in which case the OFF→ON
    // branch wouldn't fire and we'd inherit whatever stale enabledAt
    // (possibly null) was already there.
    await setReminderConfig({ enabled: false });
    await setReminderConfig({
      enabled: true,
      firstAfterHours: 24,
      repeatEveryHours: 24,
      maxReminders: 3,
      totalDeadlineDays: 4,
      finalWarningHours: 24,
      quietHoursStart: "21:00",
      quietHoursEnd: "08:00",
      quietHoursTz: "Asia/Riyadh",
      requiredDocs: ["photo", "iban", "national_id", "vaccination_report"],
    });
    const seeded = await getReminderConfig();
    assert.equal(typeof seeded.enabledAt, "string", "fixture must seed an enabledAt timestamp");

    // 1. GET — same request the client makes.
    const getReq = makeReq({ method: "GET" });
    const getCap = makeRes();
    await handlers.get(getReq, getCap.res);
    assert.equal(getCap.statusCode(), 200, "GET must succeed");
    const getBody = getCap.body() as { config: any; templates: any };
    assert.ok(getBody.config, "GET response must include config");
    // enabledAt MUST be present in the GET response — that's the value
    // the client will round-trip back on save.
    assert.equal(typeof getBody.config.enabledAt, "string",
      "GET response must include enabledAt as a string when enabled=true (this is the field that broke saving)");
    assert.deepEqual(getBody.config.requiredDocs.sort(),
      ["iban", "national_id", "photo", "vaccination_report"],
      "GET response must include all four required docs (this is the second field that broke saving)");

    // 2. PUT — exact GET payload, untouched. This is what the client
    //    does. Before this fix it 400'd with `unrecognized_keys:
    //    enabledAt` (and would 400 with `invalid_enum_value:
    //    vaccination_report` after that was unblocked).
    const putReq = makeReq({ body: { config: getBody.config, templates: getBody.templates } });
    const putCap = makeRes();
    await handlers.put(putReq, putCap.res);
    assert.equal(putCap.statusCode(), 200,
      `PUT must succeed with the unmodified GET payload — got ${putCap.statusCode()}: ${JSON.stringify(putCap.body())}`);

    const putBody = putCap.body() as { config: any; templates: any };
    assert.ok(putBody.config, "PUT response must include config");
    assert.deepEqual(
      putBody.config.requiredDocs.sort(),
      ["iban", "national_id", "photo", "vaccination_report"],
      "PUT response must echo all four required docs back",
    );
  });

  it("ignores client-supplied enabledAt — server-managed value wins", async () => {
    // Seed with enabled=true → enabledAt is some real timestamp.
    await setReminderConfig({ enabled: true });
    const seeded = await getReminderConfig();
    const realEnabledAt = seeded.enabledAt;
    assert.equal(typeof realEnabledAt, "string", "fixture must seed an enabledAt timestamp");

    // Client tries to inject a different enabledAt. The server must
    // ignore it and leave the persisted value untouched (no OFF→ON
    // transition happened, so setReminderConfig will overwrite the
    // patch's enabledAt with the existing one).
    const malicious = "1999-01-01T00:00:00.000Z";
    const putReq = makeReq({ body: { config: { enabledAt: malicious, firstAfterHours: 12 } } });
    const putCap = makeRes();
    await handlers.put(putReq, putCap.res);
    assert.equal(putCap.statusCode(), 200,
      `PUT must succeed when enabledAt is supplied — got ${putCap.statusCode()}: ${JSON.stringify(putCap.body())}`);

    const persisted = await getReminderConfig();
    assert.equal(persisted.enabledAt, realEnabledAt,
      "server-managed enabledAt MUST be preserved — client cannot overwrite it via PUT");
    assert.equal(persisted.firstAfterHours, 12,
      "the legitimate field in the same patch MUST still be applied");
  });

  it("400s on a genuinely unknown field — strict() is still enforced for everything except enabledAt", async () => {
    const putReq = makeReq({ body: { config: { somethingUnexpected: "should be rejected" } } });
    const putCap = makeRes();
    await handlers.put(putReq, putCap.res);
    assert.equal(putCap.statusCode(), 400,
      "strict() must still reject genuinely unknown keys — only enabledAt was added to the allowlist");
  });

  it("400s on a doc id outside the four-doc whitelist", async () => {
    const putReq = makeReq({ body: { config: { requiredDocs: ["photo", "not_a_real_doc"] } } });
    const putCap = makeRes();
    await handlers.put(putReq, putCap.res);
    assert.equal(putCap.statusCode(), 400,
      "doc enum must still reject unknown ids — only vaccination_report was added");
  });
});
