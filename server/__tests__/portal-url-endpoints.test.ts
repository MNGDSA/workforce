import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express, { type Express, type Request, type Response } from "express";
import request from "supertest";
import {
  getPortalBaseUrl,
  PortalBaseUrlNotConfiguredError,
} from "../lib/portal-url";
import { renderReminderTemplate } from "../onboarding-reminders";
import { trL } from "../i18n";

/**
 * HTTP-level integration coverage for the two endpoints fixed in
 * Task #263:
 *
 *   - POST /api/onboarding/reminder-test-sms (admin reminder preview)
 *   - POST /api/candidates/re-engagement-sms (bulk re-engagement nudge)
 *
 * Both used to embed `{portal_url}` with a hard-coded path suffix
 * (`/candidate/onboarding` and `/login` respectively) that 404'd on
 * the live client router. The fix routes both through
 * `getPortalBaseUrl()` and emits the bare base URL.
 *
 * These tests mount a minimal Express harness whose handlers replay
 * the production handler's URL-emission code path verbatim:
 *
 *   1. Resolve the workforce base URL via `getPortalBaseUrl(tx?)`.
 *   2. Build the SMS message text using the SAME helpers the real
 *      handlers call: `renderReminderTemplate` for reminder-test-sms
 *      and `trL("sms.reengagement", { link })` for re-engagement.
 *   3. Return the resulting message text in the response.
 *
 * The harness intentionally skips auth, persistence, and the SMS
 * gateway — those are not part of the bug under test. What is
 * asserted is the wire-level guarantee: the link embedded in the
 * SMS body equals the resolved base URL exactly, with NO appended
 * path.
 *
 * A static guard test below greps the production handlers in
 * `server/routes.ts` to ensure they keep calling the helpers used
 * here, so the integration mirror cannot silently drift from the
 * real route.
 */

// Snapshot/restore the env vars the helper reads.
const originalEnv = { ...process.env };
const TRACKED = ["PUBLIC_APP_URL", "REPLIT_DEV_DOMAIN", "NODE_ENV"] as const;
function setEnv(patch: Record<string, string | undefined>) {
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  }
}
function restoreEnv() {
  for (const k of TRACKED) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
}

// In-memory mock of the system_settings tx the helper accepts.
function mockTx(value: string | null | undefined) {
  return {
    select: () => ({
      from: () => ({
        where: async () => (value === undefined ? [] : [{ value }]),
      }),
    }),
  };
}

// Stash the system-setting value the test wants the harness to
// resolve to. The harness handlers pass this into getPortalBaseUrl.
let nextSettingValue: string | null | undefined = undefined;
function withSetting(v: string | null | undefined) {
  nextSettingValue = v;
}

function buildHarness(): Express {
  const app = express();
  app.use(express.json());

  // Mirrors routes.ts: app.post("/api/onboarding/reminder-test-sms", ...)
  // — specifically the URL-construction and template-render lines
  // (current location server/routes.ts ~4341-4367).
  app.post("/api/onboarding/reminder-test-sms", async (req: Request, res: Response) => {
    try {
      const variant = (req.body?.variant === "final" ? "final" : "regular") as "regular" | "final";
      const locale = (req.body?.locale === "en" ? "en" : "ar") as "ar" | "en";
      // Fixed template text used in tests so we don't depend on DB
      // state; the real handler fetches the same shape from
      // getReminderTemplate(). Both templates contain `{portal_url}`,
      // which is the bug surface under test.
      const tpl =
        locale === "ar"
          ? "مرحباً {name}، الرابط: {portal_url} — الموعد: {deadline_date}"
          : "Hello {name}, link: {portal_url} — deadline: {deadline_date}";
      const portalUrl = await getPortalBaseUrl(mockTx(nextSettingValue) as any);
      const message = renderReminderTemplate(tpl, {
        name: locale === "ar" ? "مرشح تجريبي" : "Test Candidate",
        missingDocs: locale === "ar" ? "صورة" : "photo",
        portalUrl,
        deadlineDate: "2026-05-02 09:00",
      });
      return res.json({ ok: true, preview: message, portalUrl, variant });
    } catch (err) {
      if (err instanceof PortalBaseUrlNotConfiguredError) {
        return res.status(503).json({ ok: false, error: "portal_url_not_configured" });
      }
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Mirrors routes.ts: app.post("/api/candidates/re-engagement-sms", ...)
  // — specifically the URL-construction and message-build lines
  // (current location server/routes.ts ~3122-3149).
  app.post("/api/candidates/re-engagement-sms", async (req: Request, res: Response) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
      if (ids.length === 0) {
        return res.status(400).json({ message: "ids required" });
      }
      const locale = (req.body?.locale === "en" ? "en" : "ar") as "ar" | "en";
      const portalUrl = await getPortalBaseUrl(mockTx(nextSettingValue) as any);
      const message = trL(locale, "sms.reengagement", { link: portalUrl });
      // Echo the message that WOULD be sent to the gateway so the
      // test can inspect it. The real handler hands `message` to
      // sendSmsViaPlugin; intercepting that gateway is out of scope.
      return res.json({
        sent: 0, skipped: 0, failed: 0, total: ids.length,
        intendedMessage: message,
        portalUrl,
      });
    } catch (err) {
      if (err instanceof PortalBaseUrlNotConfiguredError) {
        return res.status(503).json({ error: "portal_url_not_configured" });
      }
      return res.status(500).json({ error: "internal_error" });
    }
  });

  return app;
}

describe("portal-url endpoints (HTTP integration)", () => {
  let app: Express;

  before(() => {
    app = buildHarness();
  });
  beforeEach(() => {
    setEnv({ PUBLIC_APP_URL: undefined, REPLIT_DEV_DOMAIN: undefined, NODE_ENV: "test" });
    nextSettingValue = undefined;
  });
  afterEach(() => {
    restoreEnv();
    nextSettingValue = undefined;
  });

  describe("POST /api/onboarding/reminder-test-sms", () => {
    it("emits the bare base URL and NO 404 path suffix (en + regular)", async () => {
      withSetting("https://workforce.example.com");
      const res = await request(app)
        .post("/api/onboarding/reminder-test-sms")
        .send({ variant: "regular", locale: "en", phone: "+966500000000" });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.equal(res.body.portalUrl, "https://workforce.example.com");
      // Exact bare base URL appears verbatim in the rendered SMS.
      assert.ok(
        (res.body.preview as string).includes("https://workforce.example.com"),
        `preview must contain bare base URL, got: ${res.body.preview}`,
      );
      // Critical regression guard: the offending suffix MUST NOT
      // re-appear in the rendered message body.
      assert.ok(!(res.body.preview as string).includes("/candidate/onboarding"), `preview leaked /candidate/onboarding suffix: ${res.body.preview}`);
      assert.ok(!(res.body.preview as string).includes("/login"), `preview leaked /login suffix: ${res.body.preview}`);
    });

    it("emits the bare base URL and NO 404 path suffix (ar + final)", async () => {
      withSetting("https://workforce.example.com/");
      const res = await request(app)
        .post("/api/onboarding/reminder-test-sms")
        .send({ variant: "final", locale: "ar", phone: "+966500000000" });
      assert.equal(res.status, 200);
      // Trailing slash on the configured value is normalized away by
      // the helper; downstream rendering must therefore see the bare
      // base URL exactly once with no double slashes.
      assert.equal(res.body.portalUrl, "https://workforce.example.com");
      assert.ok((res.body.preview as string).includes("https://workforce.example.com"));
      assert.ok(!(res.body.preview as string).includes("workforce.example.com/candidate"));
      assert.ok(!(res.body.preview as string).includes("workforce.example.com/login"));
    });

    it("returns 503 when no portal URL source is configured", async () => {
      // Fully unconfigured + test env without dev-domain.
      setEnv({ PUBLIC_APP_URL: undefined, REPLIT_DEV_DOMAIN: undefined, NODE_ENV: "production" });
      withSetting(undefined);
      const res = await request(app)
        .post("/api/onboarding/reminder-test-sms")
        .send({ variant: "regular", locale: "en", phone: "+966500000000" });
      assert.equal(res.status, 503);
      assert.equal(res.body.error, "portal_url_not_configured");
    });

    it("respects PUBLIC_APP_URL env when system setting is empty", async () => {
      setEnv({ PUBLIC_APP_URL: "https://envvar.example.com", NODE_ENV: "production" });
      withSetting(undefined);
      const res = await request(app)
        .post("/api/onboarding/reminder-test-sms")
        .send({ variant: "regular", locale: "en" });
      assert.equal(res.status, 200);
      assert.equal(res.body.portalUrl, "https://envvar.example.com");
      assert.ok((res.body.preview as string).includes("https://envvar.example.com"));
      assert.ok(!(res.body.preview as string).includes("envvar.example.com/"));
    });
  });

  describe("POST /api/candidates/re-engagement-sms", () => {
    it("intended SMS message embeds bare base URL and NO /login suffix (en)", async () => {
      withSetting("https://workforce.example.com");
      const res = await request(app)
        .post("/api/candidates/re-engagement-sms")
        .send({ ids: ["cand-1"], locale: "en" });
      assert.equal(res.status, 200);
      assert.equal(res.body.portalUrl, "https://workforce.example.com");
      const msg = res.body.intendedMessage as string;
      assert.ok(msg.includes("https://workforce.example.com"), `message must contain bare base URL: ${msg}`);
      assert.ok(!msg.includes("/login"), `message leaked /login suffix: ${msg}`);
      assert.ok(!msg.includes("/candidate"), `message leaked /candidate suffix: ${msg}`);
      // Exactly one occurrence of the URL — guards against
      // accidental double-substitution.
      const occurrences = msg.match(/https:\/\/workforce\.example\.com/g)?.length ?? 0;
      assert.equal(occurrences, 1, `expected exactly one URL occurrence, got ${occurrences}: ${msg}`);
    });

    it("intended SMS message embeds bare base URL and NO /login suffix (ar)", async () => {
      withSetting("https://workforce.example.com");
      const res = await request(app)
        .post("/api/candidates/re-engagement-sms")
        .send({ ids: ["cand-1"], locale: "ar" });
      assert.equal(res.status, 200);
      const msg = res.body.intendedMessage as string;
      assert.ok(msg.includes("https://workforce.example.com"), `ar message must contain bare base URL: ${msg}`);
      assert.ok(!msg.includes("/login"), `ar message leaked /login suffix: ${msg}`);
    });

    it("returns 400 when ids is empty (input validation untouched)", async () => {
      withSetting("https://workforce.example.com");
      const res = await request(app)
        .post("/api/candidates/re-engagement-sms")
        .send({ ids: [], locale: "en" });
      assert.equal(res.status, 400);
    });

    it("returns 503 when no portal URL source is configured", async () => {
      setEnv({ PUBLIC_APP_URL: undefined, REPLIT_DEV_DOMAIN: undefined, NODE_ENV: "production" });
      withSetting(undefined);
      const res = await request(app)
        .post("/api/candidates/re-engagement-sms")
        .send({ ids: ["cand-1"], locale: "en" });
      assert.equal(res.status, 503);
      assert.equal(res.body.error, "portal_url_not_configured");
    });
  });

  describe("static drift guard — the production handlers still call getPortalBaseUrl", () => {
    // If someone reverts or accidentally changes the production
    // handlers in routes.ts, this test fails loudly so the harness
    // above can't quietly drift out of sync with the real route.
    // Locate the actual `app.post(...)` registration, not stray
    // mentions in header comments / route listings.
    function findHandlerBlock(src: string, route: string): string {
      const needle = `app.post("${route}"`;
      const start = src.indexOf(needle);
      assert.ok(start > 0, `could not locate handler registration ${needle} in routes.ts`);
      return src.slice(start, start + 4000);
    }

    it("server/routes.ts re-engagement handler imports + awaits getPortalBaseUrl and uses it as `link`", async () => {
      const fs = await import("node:fs/promises");
      const src = await fs.readFile("server/routes.ts", "utf8");
      const block = findHandlerBlock(src, "/api/candidates/re-engagement-sms");
      assert.ok(/from\s+["']\.\/lib\/portal-url["']|import\(["']\.\/lib\/portal-url["']\)/.test(block), "re-engagement handler must import from ./lib/portal-url");
      assert.ok(/await\s+getPortalBaseUrl\s*\(/.test(block), "re-engagement handler must await getPortalBaseUrl()");
      assert.ok(/sms\.reengagement[\s\S]{0,200}link\s*:\s*portalUrl/.test(block), "re-engagement handler must pass portalUrl as the `link` substitution param");
      // Hard regression guard: the offending hard-coded path must
      // NOT be present anywhere in the handler block.
      assert.ok(!/portalUrl\s*\+\s*["']\/login["']/.test(block), "/login suffix must not be re-appended to portalUrl");
    });

    it("server/routes.ts reminder-test-sms handler imports + awaits getPortalBaseUrl and passes it as portalUrl", async () => {
      const fs = await import("node:fs/promises");
      const src = await fs.readFile("server/routes.ts", "utf8");
      const block = findHandlerBlock(src, "/api/onboarding/reminder-test-sms");
      assert.ok(/from\s+["']\.\/lib\/portal-url["']|import\(["']\.\/lib\/portal-url["']\)/.test(block), "reminder-test-sms handler must import from ./lib/portal-url");
      assert.ok(/await\s+getPortalBaseUrl\s*\(/.test(block), "reminder-test-sms handler must await getPortalBaseUrl()");
      assert.ok(/portalUrl\s*[,}]/.test(block), "reminder-test-sms handler must pass portalUrl into renderReminderTemplate");
      assert.ok(!/portalUrl\s*\+\s*["']\/candidate\/onboarding["']/.test(block), "/candidate/onboarding suffix must not be re-appended to portalUrl");
    });
  });
});
