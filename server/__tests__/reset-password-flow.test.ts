// Regression coverage for the password-reset flow that was silently
// broken across the entire user base from April 19 (the enumeration-
// prevention hardening) through April 29 (this fix).
//
// The /api/auth/reset-password/request endpoint correctly stopped
// echoing the phone (or a masked form) in its response — leaking
// either would let an attacker enumerate which national IDs map to
// which Saudi mobile numbers. But the auth-page frontend was never
// updated: it kept reading `data.phone` from the request response
// (now `undefined`) and POSTing `{phone: undefined, code}` to
// `/api/auth/otp/verify`, which 400'd with `invalid_sa_mobile`. Users
// (correctly) read that as "the system stopped accepting my phone
// number" and blamed the contemporaneous phone-format relax. It was
// in fact 100% impossible to complete a password reset for ten days.
//
// The fix introduces `/api/auth/reset-password/verify-otp` which
// resolves nationalId → user.phone server-side and returns just
// `{otpId}`. This file pins:
//   - /request never leaks `phone` or `maskedPhone` (security regression)
//   - /verify-otp + /reset-password drive the full reset for a real
//     fixture user, ending in a bcrypt-verifiable new password
//   - /verify-otp returns the same generic-invalid response for an
//     unknown national ID, a wrong code, and a code-format violation
//     (enumeration regression)
//
// Run with:
//   npx tsx --test server/__tests__/reset-password-flow.test.ts

import { strict as assert } from "node:assert";
import { describe, it, before, after } from "node:test";
import { createServer, type Server } from "node:http";
import express, { type Express, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { eq, like } from "drizzle-orm";

import { db } from "../db";
import { users, otpVerifications, roles } from "@shared/schema";
import { storage } from "../storage";

const FIXTURE_MARKER = "__reset_flow_test__";

type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

const handlers: Record<string, RouteHandler> = {};

interface CapturedRes {
  res: Response;
  statusCode(): number;
  body(): unknown;
  headers(): Record<string, string>;
}

function makeRes(): CapturedRes {
  let statusCode = 200;
  let body: unknown = undefined;
  const headers: Record<string, string> = {};
  const res: any = {
    status(code: number) { statusCode = code; return res; },
    json(payload: unknown) { body = payload; return res; },
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = String(value); return res; },
    send(payload: unknown) { body = payload; return res; },
  };
  return {
    res: res as Response,
    statusCode: () => statusCode,
    body: () => body,
    headers: () => headers,
  };
}

interface MockReqOpts {
  body?: unknown;
  headers?: Record<string, string>;
  ip?: string;
}

// Each test gets a unique IP so the per-IP verify throttle (which is
// process-wide and persisted in the throttle store) cannot cross-
// contaminate across tests, parallel suite runs, or unrelated traffic
// hitting the same dev DB. We deliberately stay in 198.51.100.0/24
// (TEST-NET-2, RFC 5737) so anything that *does* see these IPs in a
// log knows immediately they came from a test run.
let _ipCounter = 0;
function nextTestIp(): string {
  _ipCounter += 1;
  return `198.51.100.${(_ipCounter % 254) + 1}`;
}

function makeReq(opts: MockReqOpts = {}): Request {
  const ip = opts.ip ?? nextTestIp();
  return {
    body: opts.body ?? {},
    headers: opts.headers ?? {},
    ip,
    socket: { remoteAddress: ip },
    get(name: string) {
      const k = name.toLowerCase();
      return (opts.headers ?? {})[k];
    },
    acceptsLanguages() { return ["en"]; },
  } as unknown as Request;
}

// Recursively scan a JSON-shaped payload for any field whose key OR
// string value mentions a phone-like fragment. Catches the future
// regression where someone adds `data.maskedPhone`, `data.user.phone`,
// `data.contact.mobile`, or echoes the actual fixture digits in a
// nested error blob.
function assertNoPhoneLeak(payload: unknown, label: string, fixturePhone: string): void {
  const phoneFragment = fixturePhone.replace(/^0/, ""); // "5XXXXXXXX"
  const seen = new WeakSet<object>();
  const walk = (node: unknown, path: string): void => {
    if (node == null) return;
    if (typeof node === "string") {
      // Allow the tail-2 redacted form ("05••••XXXX") that appears in
      // server-side log lines but NEVER in response bodies — and we
      // are walking response bodies here, so any phone-shaped string
      // is a leak.
      assert.equal(/(?:\+?966|05|9665)\d{6,}/.test(node), false,
        `${label}: phone-shaped string at ${path}: ${node}`);
      assert.equal(node.includes(fixturePhone), false,
        `${label}: fixture phone leaked at ${path}: ${node}`);
      assert.equal(node.includes(phoneFragment), false,
        `${label}: fixture phone tail leaked at ${path}: ${node}`);
      return;
    }
    if (typeof node !== "object") return;
    if (seen.has(node as object)) return;
    seen.add(node as object);
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      assert.equal(kl === "phone" || kl === "maskedphone" || kl === "mobile" || kl === "msisdn", false,
        `${label}: response must not include a "${k}" field at ${path}`);
      walk(v, `${path}.${k}`);
    }
  };
  walk(payload, "$");
}

interface Fixture {
  userId: string;
  nationalId: string;
  phone: string;
  originalPasswordHash: string;
}

let fixture: Fixture;

async function seedFixture(): Promise<Fixture> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  // 10-digit national ID — same shape the production lookup expects.
  const nationalId = `99${suffix.replace(/[^0-9]/g, "").padEnd(8, "0").slice(0, 8)}`;
  // Saudi mobile in canonical 05XXXXXXXX form.
  const phoneTail = String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8);
  const phone = `05${phoneTail}`;

  // Resolve a real role id — users.role_id is NOT NULL. Pick "candidate"
  // since it's universally seeded by the boot RBAC step.
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.slug, "candidate"));
  assert.ok(role, "expected `candidate` role to exist (boot RBAC seed); cannot seed test user");

  const originalPasswordHash = await bcrypt.hash("OriginalPass1!", 4);
  const [user] = await db.insert(users).values({
    username: `${FIXTURE_MARKER}-${suffix}`,
    fullName: `${FIXTURE_MARKER}-user-${suffix}`,
    nationalId,
    phone,
    password: originalPasswordHash,
    roleId: role.id,
    isActive: true,
  }).returning();

  return { userId: user.id, nationalId, phone, originalPasswordHash };
}

before(async () => {
  // Mount the real registerRoutes onto a throwaway Express app so we
  // can extract the actual handler functions and call them with
  // mock req/res objects — same pattern as
  // server/__tests__/smp-commit-iban-resolution.test.ts. This tests
  // the production code path without standing up an HTTP listener.
  const { registerRoutes } = await import("../routes");
  const app: Express = express();
  app.use(express.json());
  const httpServer: Server = createServer(app);
  await registerRoutes(httpServer, app);

  const router = (app as any).router ?? (app as any)._router;
  const stack = router?.stack ?? [];
  const wanted = new Map<string, string>([
    ["POST /api/auth/reset-password/request", "request"],
    ["POST /api/auth/reset-password/verify-otp", "verify"],
    ["POST /api/auth/reset-password", "finalize"],
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

  fixture = await seedFixture();
});

after(async () => {
  // Sweep both the user we made and any OTPs we accumulated against
  // its phone, plus any other __reset_flow_test__ rows from a half-
  // finished previous run.
  if (fixture?.phone) {
    await db.delete(otpVerifications).where(eq(otpVerifications.phone, fixture.phone));
  }
  await db.delete(users).where(like(users.fullName, `${FIXTURE_MARKER}%`));
});

describe("password-reset flow", () => {
  // Captured the very first time a generic-invalid response is observed,
  // then asserted equal across every subsequent failure path. This is
  // the strict enumeration check: if any branch ever drifts to a
  // distinguishable message ("OTP expired" vs "OTP invalid" vs "no
  // account"), the assertion fires.
  let pinnedInvalidMessage: string | undefined;
  const pinInvalid = (msg: unknown, label: string): void => {
    assert.equal(typeof msg, "string", `${label}: message must be a string, got ${typeof msg}`);
    if (pinnedInvalidMessage === undefined) {
      pinnedInvalidMessage = msg as string;
      return;
    }
    assert.equal(msg, pinnedInvalidMessage,
      `${label}: generic-invalid message drifted — every failure branch must return the EXACT same body to stay enumeration-safe.`);
  };

  it("/request returns generic shape and never leaks phone (enumeration safe)", async () => {
    const cap = makeRes();
    await handlers.request(
      makeReq({ body: { nationalId: fixture.nationalId } }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 200);
    const body = cap.body() as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.ok(typeof body.expiresAt === "string", "expected expiresAt ISO string");
    assertNoPhoneLeak(body, "request(known)", fixture.phone);
  });

  it("/request also returns generic 200 for an unknown national ID (no enumeration)", async () => {
    const cap = makeRes();
    await handlers.request(
      makeReq({ body: { nationalId: "0000000000" } }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 200);
    const body = cap.body() as Record<string, unknown>;
    assert.equal(body.ok, true);
    assertNoPhoneLeak(body, "request(unknown)", fixture.phone);
  });

  it("/verify-otp + /reset-password drive a full successful reset", async () => {
    // Seed a fresh OTP exactly the way /request would have, then drive
    // the new verify-otp endpoint to land an otpId, then finalize.
    const code = "424242";
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    // Wipe any earlier OTPs for this phone so getLatestOtpVerification
    // returns the one we just created (test ordering insurance).
    await db.delete(otpVerifications).where(eq(otpVerifications.phone, fixture.phone));
    const reserved = await storage.tryReserveAndCreateOtpVerification(
      fixture.phone, code, expiresAt, "password_reset", 3, 10 * 60 * 1000,
    );
    assert.equal(reserved.ok, true);

    // ── verify-otp ──────────────────────────────────────────────────
    const verifyCap = makeRes();
    await handlers.verify(
      makeReq({ body: { nationalId: fixture.nationalId, code } }),
      verifyCap.res,
    );
    assert.equal(verifyCap.statusCode(), 200, `verify body: ${JSON.stringify(verifyCap.body())}`);
    const verifyBody = verifyCap.body() as { otpId?: string };
    assert.ok(verifyBody.otpId, "expected otpId in verify response");
    assertNoPhoneLeak(verifyBody, "verify(success)", fixture.phone);

    // ── finalize ────────────────────────────────────────────────────
    const newPassword = "BrandNewPass1!";
    const finalCap = makeRes();
    await handlers.finalize(
      makeReq({
        body: {
          nationalId: fixture.nationalId,
          otpId: verifyBody.otpId,
          newPassword,
        },
      }),
      finalCap.res,
    );
    assert.equal(finalCap.statusCode(), 200, `finalize body: ${JSON.stringify(finalCap.body())}`);
    assertNoPhoneLeak(finalCap.body(), "finalize(success)", fixture.phone);

    // Bcrypt-verify the freshly-stored password from the DB.
    const [updated] = await db.select().from(users).where(eq(users.id, fixture.userId));
    assert.ok(await bcrypt.compare(newPassword, updated.password!), "new password must bcrypt-match");
    assert.equal(await bcrypt.compare("OriginalPass1!", updated.password!), false, "old password must no longer match");

    // Restore for any later tests in the suite.
    await db.update(users).set({ password: fixture.originalPasswordHash }).where(eq(users.id, fixture.userId));
  });

  it("/verify-otp returns generic 400 for unknown national ID (no enumeration)", async () => {
    const cap = makeRes();
    await handlers.verify(
      makeReq({ body: { nationalId: "0000000000", code: "123456" } }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400);
    const body = cap.body() as Record<string, unknown>;
    pinInvalid(body.message, "verify(unknown nid)");
    assertNoPhoneLeak(body, "verify(unknown nid)", fixture.phone);
  });

  it("/verify-otp returns generic 400 + increments attempts for a wrong code", async () => {
    const correctCode = "555555";
    await db.delete(otpVerifications).where(eq(otpVerifications.phone, fixture.phone));
    const reserved = await storage.tryReserveAndCreateOtpVerification(
      fixture.phone, correctCode, new Date(Date.now() + 5 * 60 * 1000),
      "password_reset", 3, 10 * 60 * 1000,
    );
    assert.equal(reserved.ok, true);

    const cap = makeRes();
    await handlers.verify(
      makeReq({ body: { nationalId: fixture.nationalId, code: "111111" } }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400);
    const body = cap.body() as Record<string, unknown>;
    pinInvalid(body.message, "verify(wrong code)");
    assertNoPhoneLeak(body, "verify(wrong code)", fixture.phone);

    const otp = await storage.getLatestOtpVerification(fixture.phone);
    assert.ok(otp, "OTP row should still exist");
    assert.equal(otp!.attempts, 1, "wrong-code path must increment attempts");
    assert.equal(otp!.verifiedAt, null, "wrong-code path must NOT mark verified");
  });

  it("/verify-otp returns generic 400 for malformed code (no shape probing)", async () => {
    const cap = makeRes();
    await handlers.verify(
      makeReq({ body: { nationalId: fixture.nationalId, code: "abc" } }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400);
    const body = cap.body() as Record<string, unknown>;
    pinInvalid(body.message, "verify(malformed code)");
    assertNoPhoneLeak(body, "verify(malformed code)", fixture.phone);
  });

  // The finalize endpoint used to be a 5-way enumeration oracle (404 vs
  // distinct 400s). These four assertions pin that every "OTP/session/
  // account is wrong" branch now returns the SAME generic-invalid body.
  it("/reset-password returns generic 400 for unknown national ID", async () => {
    const cap = makeRes();
    await handlers.finalize(
      makeReq({
        body: {
          nationalId: "0000000000",
          otpId: "00000000-0000-0000-0000-000000000000",
          newPassword: "BrandNewPass1!",
        },
      }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400, `finalize(unknown nid): expected 400, got ${cap.statusCode()} body=${JSON.stringify(cap.body())}`);
    const body = cap.body() as Record<string, unknown>;
    pinInvalid(body.message, "finalize(unknown nid)");
    assertNoPhoneLeak(body, "finalize(unknown nid)", fixture.phone);
  });

  it("/reset-password returns generic 400 for known nid + bogus otpId", async () => {
    const cap = makeRes();
    await handlers.finalize(
      makeReq({
        body: {
          nationalId: fixture.nationalId,
          otpId: "00000000-0000-0000-0000-000000000000",
          newPassword: "BrandNewPass1!",
        },
      }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400);
    const body = cap.body() as Record<string, unknown>;
    pinInvalid(body.message, "finalize(bogus otpId)");
    assertNoPhoneLeak(body, "finalize(bogus otpId)", fixture.phone);
  });

  it("/reset-password returns generic 400 for an unverified OTP", async () => {
    // Seed a fresh OTP but DO NOT verify it — finalize must collapse to
    // the generic-invalid response, same body as every other branch.
    await db.delete(otpVerifications).where(eq(otpVerifications.phone, fixture.phone));
    const reserved = await storage.tryReserveAndCreateOtpVerification(
      fixture.phone, "777777", new Date(Date.now() + 5 * 60 * 1000),
      "password_reset", 3, 10 * 60 * 1000,
    );
    assert.equal(reserved.ok, true);
    const otpId = reserved.ok ? reserved.otp.id : "";

    const cap = makeRes();
    await handlers.finalize(
      makeReq({
        body: {
          nationalId: fixture.nationalId,
          otpId,
          newPassword: "BrandNewPass1!",
        },
      }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400);
    const body = cap.body() as Record<string, unknown>;
    pinInvalid(body.message, "finalize(unverified otp)");
    assertNoPhoneLeak(body, "finalize(unverified otp)", fixture.phone);
  });

  it("/reset-password returns generic 400 for an EXPIRED verified OTP (>30min past expiry)", async () => {
    // The 30-minute grace window after the OTP's nominal 5-minute
    // expiry must collapse to generic-invalid. Previously this branch
    // returned the distinguishable "otp.sessionExpiredShort" message.
    await db.delete(otpVerifications).where(eq(otpVerifications.phone, fixture.phone));
    const reserved = await storage.tryReserveAndCreateOtpVerification(
      fixture.phone, "888888", new Date(Date.now() + 5 * 60 * 1000),
      "password_reset", 3, 10 * 60 * 1000,
    );
    assert.equal(reserved.ok, true);
    const otpId = reserved.ok ? reserved.otp.id : "";
    // Force the row into "verified, but well past the 30-min grace".
    const longAgo = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    await db.update(otpVerifications)
      .set({ verifiedAt: longAgo, expiresAt: longAgo })
      .where(eq(otpVerifications.id, otpId));

    const cap = makeRes();
    await handlers.finalize(
      makeReq({
        body: {
          nationalId: fixture.nationalId,
          otpId,
          newPassword: "BrandNewPass1!",
        },
      }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400);
    const body = cap.body() as Record<string, unknown>;
    pinInvalid(body.message, "finalize(expired)");
    assertNoPhoneLeak(body, "finalize(expired)", fixture.phone);
  });

  it("/reset-password returns generic 400 for an ALREADY-USED OTP", async () => {
    // Replay protection: previously returned distinguishable
    // "otp.alreadyUsed" message. Must now collapse to generic-invalid.
    await db.delete(otpVerifications).where(eq(otpVerifications.phone, fixture.phone));
    const reserved = await storage.tryReserveAndCreateOtpVerification(
      fixture.phone, "999999", new Date(Date.now() + 5 * 60 * 1000),
      "password_reset", 3, 10 * 60 * 1000,
    );
    assert.equal(reserved.ok, true);
    const otpId = reserved.ok ? reserved.otp.id : "";
    await db.update(otpVerifications)
      .set({ verifiedAt: new Date(), usedForRegistration: true })
      .where(eq(otpVerifications.id, otpId));

    const cap = makeRes();
    await handlers.finalize(
      makeReq({
        body: {
          nationalId: fixture.nationalId,
          otpId,
          newPassword: "BrandNewPass1!",
        },
      }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400);
    const body = cap.body() as Record<string, unknown>;
    pinInvalid(body.message, "finalize(already used)");
    assertNoPhoneLeak(body, "finalize(already used)", fixture.phone);
  });

  it("/reset-password returns generic 400 for a WRONG-PURPOSE OTP (registration row passed off as reset)", async () => {
    // An attacker who somehow obtained a valid registration otpId for
    // a target's phone must NOT be able to use it as a reset token.
    // Previously returned distinguishable "otp.invalidSessionShort".
    await db.delete(otpVerifications).where(eq(otpVerifications.phone, fixture.phone));
    const reserved = await storage.tryReserveAndCreateOtpVerification(
      fixture.phone, "121212", new Date(Date.now() + 5 * 60 * 1000),
      "registration", 3, 10 * 60 * 1000,
    );
    assert.equal(reserved.ok, true);
    const otpId = reserved.ok ? reserved.otp.id : "";
    await db.update(otpVerifications)
      .set({ verifiedAt: new Date() })
      .where(eq(otpVerifications.id, otpId));

    const cap = makeRes();
    await handlers.finalize(
      makeReq({
        body: {
          nationalId: fixture.nationalId,
          otpId,
          newPassword: "BrandNewPass1!",
        },
      }),
      cap.res,
    );
    assert.equal(cap.statusCode(), 400);
    const body = cap.body() as Record<string, unknown>;
    pinInvalid(body.message, "finalize(wrong purpose)");
    assertNoPhoneLeak(body, "finalize(wrong purpose)", fixture.phone);
  });
});
