// Task #232 — regression coverage for the reminder-settings PUT validator.
// The validator's strict() schema rejected `enabledAt` (a server-managed
// field the GET response includes and the client round-trips), and the
// `requiredDocs` enum was missing "vaccination_report".

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
    authUserId: null,
    authPermissions: new Set<string>(),
    authIsSuperAdmin: true,
  } as unknown as Request;
}

let priorRawConfig: string | undefined;

before(async () => {
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
      handlers[slot] = subStack[subStack.length - 1].handle;
    }
  }
  for (const [key, slot] of wanted) {
    assert.ok(handlers[slot], `could not locate ${key} handler in router stack`);
  }

  priorRawConfig = (await storage.getSystemSetting("onboarding_reminder_config")) ?? undefined;
});

after(async () => {
  if (priorRawConfig === undefined) {
    await storage.setSystemSetting("onboarding_reminder_config", "");
  } else {
    await storage.setSystemSetting("onboarding_reminder_config", priorRawConfig);
  }
});

describe("reminder-settings PUT validator (task #232)", () => {
  it("accepts the unmodified GET-shape body — enabledAt timestamp + vaccination_report", async () => {
    // Force OFF→ON so setReminderConfig stamps a fresh non-null enabledAt
    // regardless of the dev DB's prior state.
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

    const getReq = makeReq({ method: "GET" });
    const getCap = makeRes();
    await handlers.get(getReq, getCap.res);
    assert.equal(getCap.statusCode(), 200);
    const getBody = getCap.body() as { config: any; templates: any };
    assert.equal(typeof getBody.config.enabledAt, "string", "GET must include enabledAt as a string");
    assert.deepEqual(getBody.config.requiredDocs.sort(),
      ["iban", "national_id", "photo", "vaccination_report"]);

    const putReq = makeReq({ body: { config: getBody.config, templates: getBody.templates } });
    const putCap = makeRes();
    await handlers.put(putReq, putCap.res);
    assert.equal(putCap.statusCode(), 200,
      `PUT must succeed — got ${putCap.statusCode()}: ${JSON.stringify(putCap.body())}`);

    const putBody = putCap.body() as { config: any };
    assert.deepEqual(putBody.config.requiredDocs.sort(),
      ["iban", "national_id", "photo", "vaccination_report"]);
  });

  it("ignores client-supplied enabledAt — server-managed value wins", async () => {
    await setReminderConfig({ enabled: true });
    const realEnabledAt = (await getReminderConfig()).enabledAt;
    assert.equal(typeof realEnabledAt, "string");

    const putReq = makeReq({ body: { config: { enabledAt: "1999-01-01T00:00:00.000Z", firstAfterHours: 12 } } });
    const putCap = makeRes();
    await handlers.put(putReq, putCap.res);
    assert.equal(putCap.statusCode(), 200);

    const persisted = await getReminderConfig();
    assert.equal(persisted.enabledAt, realEnabledAt, "client cannot overwrite server-managed enabledAt");
    assert.equal(persisted.firstAfterHours, 12, "the legitimate field in the same patch is still applied");
  });

  it("400s on a genuinely unknown field — strict() still enforced beyond enabledAt", async () => {
    const putReq = makeReq({ body: { config: { somethingUnexpected: "rejected" } } });
    const putCap = makeRes();
    await handlers.put(putReq, putCap.res);
    assert.equal(putCap.statusCode(), 400);
  });

  it("400s on a doc id outside the four-doc whitelist", async () => {
    const putReq = makeReq({ body: { config: { requiredDocs: ["photo", "not_a_real_doc"] } } });
    const putCap = makeRes();
    await handlers.put(putReq, putCap.res);
    assert.equal(putCap.statusCode(), 400);
  });
});
