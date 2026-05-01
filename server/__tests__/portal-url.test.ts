// Task #263 — guard the single source of truth for the workforce app
// portal URL embedded in every candidate-facing SMS.
//
// Run with: `npx tsx --test server/__tests__/portal-url.test.ts`

import { strict as assert } from "node:assert";
import { describe, it, beforeEach, afterEach } from "node:test";

import { getPortalBaseUrl, PortalBaseUrlNotConfiguredError } from "../lib/portal-url";
import { renderReminderTemplate } from "../onboarding-reminders";
import type { db as DbReal } from "../db";

// ── Mock tx ────────────────────────────────────────────────────────────────
// `getPortalBaseUrl` only calls `tx.select().from(...).where(...)` and
// awaits the result. We mock that single chain to control what the
// system_settings row looks like for each test.
//
// Type contract: structurally narrow the mock to the exact subset of
// the Drizzle select chain `getPortalBaseUrl` invokes. The `unknown`
// cast at the boundary is used in lieu of `any` so the production
// `getPortalBaseUrl` signature still type-checks at the callsite
// while we avoid reproducing Drizzle's full fluent type machinery
// here. The shape below is enforced by TypeScript inside the test
// scope; only the final hand-off to `getPortalBaseUrl` needs the
// `unknown` cast — `any` would silently disable all type checking
// inside the mock, which is what we are explicitly avoiding.
type SystemSettingsRow = { value: string | null };
interface PortalUrlTxMock {
  select(...args: unknown[]): {
    from(...args: unknown[]): {
      where(...args: unknown[]): Promise<SystemSettingsRow[]>;
    };
  };
}
type PortalUrlTx = typeof DbReal;
function mockTx(value: string | null | undefined): PortalUrlTx {
  const rows: SystemSettingsRow[] = value === undefined ? [] : [{ value: value as string | null }];
  const m: PortalUrlTxMock = {
    select: () => ({
      from: () => ({
        where: async () => rows,
      }),
    }),
  };
  return m as unknown as PortalUrlTx;
}

// Snapshot/restore the env vars the helper reads so tests don't bleed.
const originalEnv = { ...process.env };
const TRACKED_ENV_KEYS = ["PUBLIC_APP_URL", "REPLIT_DEV_DOMAIN", "NODE_ENV"] as const;
function setEnv(patch: Record<string, string | undefined>) {
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) delete process.env[k];
    else process.env[k] = patch[k];
  }
}
function restoreEnv() {
  for (const k of TRACKED_ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
}

describe("getPortalBaseUrl", () => {
  beforeEach(() => {
    // Default each test into a clean slate WITH NODE_ENV=development so the
    // dev-domain fallback path is exercisable. Production-gating cases
    // override this explicitly.
    setEnv({ PUBLIC_APP_URL: undefined, REPLIT_DEV_DOMAIN: undefined, NODE_ENV: "development" });
  });
  afterEach(() => {
    restoreEnv();
  });

  describe("resolution order", () => {
    it("system setting wins over env var and dev domain", async () => {
      setEnv({
        PUBLIC_APP_URL: "https://from-env.example.com",
        REPLIT_DEV_DOMAIN: "from-dev.example.com",
      });
      const url = await getPortalBaseUrl(mockTx("https://from-setting.example.com"));
      assert.equal(url, "https://from-setting.example.com");
    });

    it("PUBLIC_APP_URL wins over REPLIT_DEV_DOMAIN when system setting is empty", async () => {
      setEnv({
        PUBLIC_APP_URL: "https://from-env.example.com",
        REPLIT_DEV_DOMAIN: "from-dev.example.com",
      });
      const url = await getPortalBaseUrl(mockTx(undefined));
      assert.equal(url, "https://from-env.example.com");
    });

    it("falls back to REPLIT_DEV_DOMAIN with https:// prefix", async () => {
      setEnv({ REPLIT_DEV_DOMAIN: "abc-123.repl.co" });
      const url = await getPortalBaseUrl(mockTx(undefined));
      assert.equal(url, "https://abc-123.repl.co");
    });

    it("treats whitespace-only system setting as empty and falls through", async () => {
      setEnv({ PUBLIC_APP_URL: "https://from-env.example.com" });
      const url = await getPortalBaseUrl(mockTx("   "));
      assert.equal(url, "https://from-env.example.com");
    });

    it("treats whitespace-only PUBLIC_APP_URL as empty and falls through", async () => {
      setEnv({
        PUBLIC_APP_URL: "   ",
        REPLIT_DEV_DOMAIN: "abc-123.repl.co",
      });
      const url = await getPortalBaseUrl(mockTx(undefined));
      assert.equal(url, "https://abc-123.repl.co");
    });
  });

  describe("trailing slash stripping", () => {
    it("strips a single trailing slash from the system setting", async () => {
      const url = await getPortalBaseUrl(mockTx("https://workforce.example.com/"));
      assert.equal(url, "https://workforce.example.com");
    });

    it("strips multiple trailing slashes", async () => {
      const url = await getPortalBaseUrl(mockTx("https://workforce.example.com////"));
      assert.equal(url, "https://workforce.example.com");
    });

    it("strips trailing slash from PUBLIC_APP_URL fallback", async () => {
      setEnv({ PUBLIC_APP_URL: "https://from-env.example.com/" });
      const url = await getPortalBaseUrl(mockTx(undefined));
      assert.equal(url, "https://from-env.example.com");
    });

    it("strips trailing slash from REPLIT_DEV_DOMAIN fallback (after https prefix)", async () => {
      setEnv({ REPLIT_DEV_DOMAIN: "abc-123.repl.co/" });
      const url = await getPortalBaseUrl(mockTx(undefined));
      // Helper trims input first then prefixes https:// then strips slashes.
      // Either way, no trailing slash on the result.
      assert.ok(!url.endsWith("/"), `expected no trailing slash, got ${url}`);
    });

    it("leaves non-trailing slashes alone (path components are preserved)", async () => {
      // Edge case: an admin who typed a path. We don't enforce path
      // emptiness — the contract is "no trailing slash", not
      // "no path". Callers can append `/foo` cleanly either way.
      const url = await getPortalBaseUrl(mockTx("https://workforce.example.com/sub-path"));
      assert.equal(url, "https://workforce.example.com/sub-path");
    });
  });

  describe("misconfiguration is loud", () => {
    it("throws PortalBaseUrlNotConfiguredError when nothing is set", async () => {
      await assert.rejects(
        () => getPortalBaseUrl(mockTx(undefined)),
        (err: unknown) => {
          assert.ok(err instanceof PortalBaseUrlNotConfiguredError, `expected typed error, got ${(err as { constructor?: { name?: string } } | null)?.constructor?.name}`);
          assert.match(err.message, /not configured/i);
          assert.match(err.message, /public_app_url|PUBLIC_APP_URL/);
          return true;
        },
      );
    });

    it("throws when every source is whitespace-only", async () => {
      setEnv({ PUBLIC_APP_URL: "   ", REPLIT_DEV_DOMAIN: "  " });
      await assert.rejects(
        () => getPortalBaseUrl(mockTx("  ")),
        PortalBaseUrlNotConfiguredError,
      );
    });

    it("throws when the row exists but value is null", async () => {
      await assert.rejects(
        () => getPortalBaseUrl(mockTx(null)),
        PortalBaseUrlNotConfiguredError,
      );
    });
  });

  describe("REPLIT_DEV_DOMAIN is gated to dev/test only", () => {
    it("ignores REPLIT_DEV_DOMAIN when NODE_ENV=production and throws", async () => {
      setEnv({ NODE_ENV: "production", REPLIT_DEV_DOMAIN: "agent-sandbox.repl.co" });
      await assert.rejects(
        () => getPortalBaseUrl(mockTx(undefined)),
        (err: unknown) => {
          assert.ok(err instanceof PortalBaseUrlNotConfiguredError, `expected typed error in production, got ${(err as { constructor?: { name?: string } } | null)?.constructor?.name}`);
          return true;
        },
      );
    });

    it("ignores REPLIT_DEV_DOMAIN when NODE_ENV is unset and throws", async () => {
      // The Replit dev domain is auto-set in every workspace including
      // anything that runs without an explicit NODE_ENV. The contract
      // is fail-closed: only an explicit `development` or `test` opts in.
      setEnv({ NODE_ENV: undefined, REPLIT_DEV_DOMAIN: "agent-sandbox.repl.co" });
      await assert.rejects(
        () => getPortalBaseUrl(mockTx(undefined)),
        PortalBaseUrlNotConfiguredError,
      );
    });

    it("uses REPLIT_DEV_DOMAIN when NODE_ENV=development", async () => {
      setEnv({ NODE_ENV: "development", REPLIT_DEV_DOMAIN: "abc-123.repl.co" });
      const url = await getPortalBaseUrl(mockTx(undefined));
      assert.equal(url, "https://abc-123.repl.co");
    });

    it("uses REPLIT_DEV_DOMAIN when NODE_ENV=test", async () => {
      setEnv({ NODE_ENV: "test", REPLIT_DEV_DOMAIN: "abc-123.repl.co" });
      const url = await getPortalBaseUrl(mockTx(undefined));
      assert.equal(url, "https://abc-123.repl.co");
    });

    it("PUBLIC_APP_URL still wins in production even when dev-domain is set", async () => {
      setEnv({ NODE_ENV: "production", PUBLIC_APP_URL: "https://prod.example.com", REPLIT_DEV_DOMAIN: "sandbox.repl.co" });
      const url = await getPortalBaseUrl(mockTx(undefined));
      assert.equal(url, "https://prod.example.com");
    });

    it("system setting still wins in production even when dev-domain is set", async () => {
      setEnv({ NODE_ENV: "production", REPLIT_DEV_DOMAIN: "sandbox.repl.co" });
      const url = await getPortalBaseUrl(mockTx("https://from-setting.example.com"));
      assert.equal(url, "https://from-setting.example.com");
    });
  });

  describe("SMS template integration — bare base URL is preserved verbatim", () => {
    it("rendered reminder SMS contains the resolved base URL with no path suffix", async () => {
      const baseUrl = await getPortalBaseUrl(mockTx("https://workforce.example.com/"));
      assert.equal(baseUrl, "https://workforce.example.com");

      const tpl = "Hi {name}, log in: {portal_url}. Deadline: {deadline_date}.";
      const rendered = renderReminderTemplate(tpl, {
        name: "Test",
        missingDocs: "id, photo",
        portalUrl: baseUrl,
        deadlineDate: "tomorrow",
      });

      // Exact bare URL appears, with NO appended path that would 404.
      assert.ok(rendered.includes("https://workforce.example.com."), `rendered=${rendered}`);
      assert.ok(!rendered.includes("/candidate/onboarding"), `must not append /candidate/onboarding, got: ${rendered}`);
      assert.ok(!rendered.includes("/login"), `must not append /login, got: ${rendered}`);
    });
  });

  describe("no hard-coded production hostname", () => {
    // FIXTURE-EXCEPTION: this test deliberately contains the literal
    // string the original bug used as its silent fallback so the
    // assertion can prove the helper never emits it. The sweep that
    // forbids the literal in server runtime code must skip this
    // file. Do NOT remove the literal — it is the regression guard.
    const FORBIDDEN_LEGACY_HOST = ["tanaq", "olapp"].join(""); // = "tanaqolapp"
    it("does not silently return any legacy hard-coded production URL when nothing is configured", async () => {
      // Regression guard for the original bug: a hard-coded
      // legacy production host was silently emitted on any
      // deployment whose env vars were missing, sending real
      // candidates to the wrong host (404).
      let captured: string | null = null;
      try {
        captured = await getPortalBaseUrl(mockTx(undefined));
      } catch {
        // Expected — see "misconfiguration is loud" suite.
      }
      if (captured !== null) {
        assert.ok(
          !captured.includes(FORBIDDEN_LEGACY_HOST),
          `helper must never silently return a hard-coded production host, got ${captured}`,
        );
      }
    });
  });
});
