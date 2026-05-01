// Regression coverage for the prod 500 reported on
// `POST /api/onboarding/reminder-test-sms` in May 2026.
//
// Symptoms in production:
//   {"ok":false,"preview":"","error":"internal_error"} :500
// after the operator hit "Send test SMS" from the AR onboarding panel.
//
// Root cause: `getPortalBaseUrl()` throws `PortalBaseUrlNotConfiguredError`
// when neither the `public_app_url` system_setting row nor the
// `PUBLIC_APP_URL` env var is set, AND `NODE_ENV=production` (which
// disables the REPLIT_DEV_DOMAIN fallback). The route's outer catch
// swallowed the real error and returned an opaque "internal_error",
// leaving the operator with no actionable signal.
//
// This test locks in the two contracts the fix relies on:
//   1. `PortalBaseUrlNotConfiguredError` is a real exported class so the
//      route's `instanceof` check at server/routes.ts (~line 4369) keeps
//      working after future refactors.
//   2. `getPortalBaseUrl()` throws THAT exact class (not a generic
//      Error) when nothing is configured under production NODE_ENV. If
//      anyone weakens this to a generic throw, the route's specific
//      handler stops matching and we silently regress to opaque 500s.

process.env.NODE_ENV ??= "test";

import { strict as assert } from "node:assert";
import { afterEach, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { systemSettings } from "@shared/schema";
import {
  getPortalBaseUrl,
  PortalBaseUrlNotConfiguredError,
} from "../lib/portal-url";

const SETTING_KEY = "public_app_url";

describe("reminder-test-sms regression — portal URL handling", () => {
  let originalEnv: string | undefined;
  let originalNodeEnv: string | undefined;
  let originalReplitDev: string | undefined;
  let savedSettingValue: string | null = null;

  before(async () => {
    // Snapshot the live system_settings row (if any) so we can restore
    // it. The dev DB is shared with the running app — we must not leak
    // state into other tests or into the running workspace.
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SETTING_KEY));
    savedSettingValue = rows[0]?.value ?? null;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = originalEnv;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalReplitDev === undefined) {
      delete process.env.REPLIT_DEV_DOMAIN;
    } else {
      process.env.REPLIT_DEV_DOMAIN = originalReplitDev;
    }
    // Restore the original system_settings row exactly. Use ON CONFLICT
    // on the natural key so we don't accidentally leave the table
    // mutated for the next test file.
    await db.delete(systemSettings).where(eq(systemSettings.key, SETTING_KEY));
    if (savedSettingValue !== null) {
      await db.execute(sql`
        INSERT INTO system_settings (key, value)
        VALUES (${SETTING_KEY}, ${savedSettingValue})
      `);
    }
  });

  it("PortalBaseUrlNotConfiguredError is an Error subclass with a stable name", () => {
    const err = new PortalBaseUrlNotConfiguredError();
    assert.equal(err instanceof Error, true);
    assert.equal(err instanceof PortalBaseUrlNotConfiguredError, true);
    assert.equal(err.name, "PortalBaseUrlNotConfiguredError");
    assert.match(err.message, /Workforce portal base URL is not configured/);
  });

  it("getPortalBaseUrl throws PortalBaseUrlNotConfiguredError when nothing is configured under production", async () => {
    originalEnv = process.env.PUBLIC_APP_URL;
    originalNodeEnv = process.env.NODE_ENV;
    originalReplitDev = process.env.REPLIT_DEV_DOMAIN;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.REPLIT_DEV_DOMAIN;
    process.env.NODE_ENV = "production";
    await db.delete(systemSettings).where(eq(systemSettings.key, SETTING_KEY));

    await assert.rejects(
      () => getPortalBaseUrl(),
      (e: unknown) => {
        assert.equal(
          e instanceof PortalBaseUrlNotConfiguredError,
          true,
          "must throw PortalBaseUrlNotConfiguredError so route's instanceof check matches",
        );
        return true;
      },
    );
  });

  it("getPortalBaseUrl returns the system_settings value when present (no trailing slash)", async () => {
    originalEnv = process.env.PUBLIC_APP_URL;
    originalNodeEnv = process.env.NODE_ENV;
    originalReplitDev = process.env.REPLIT_DEV_DOMAIN;
    delete process.env.PUBLIC_APP_URL;
    delete process.env.REPLIT_DEV_DOMAIN;
    process.env.NODE_ENV = "production";
    await db.delete(systemSettings).where(eq(systemSettings.key, SETTING_KEY));
    await db.execute(sql`
      INSERT INTO system_settings (key, value)
      VALUES (${SETTING_KEY}, 'https://workforce.example.com/')
    `);

    const url = await getPortalBaseUrl();
    assert.equal(url, "https://workforce.example.com");
  });

  it("getPortalBaseUrl prefers system_settings over PUBLIC_APP_URL env var", async () => {
    originalEnv = process.env.PUBLIC_APP_URL;
    originalNodeEnv = process.env.NODE_ENV;
    originalReplitDev = process.env.REPLIT_DEV_DOMAIN;
    process.env.PUBLIC_APP_URL = "https://env-wins.example.com";
    delete process.env.REPLIT_DEV_DOMAIN;
    process.env.NODE_ENV = "production";
    await db.delete(systemSettings).where(eq(systemSettings.key, SETTING_KEY));
    await db.execute(sql`
      INSERT INTO system_settings (key, value)
      VALUES (${SETTING_KEY}, 'https://setting-wins.example.com')
    `);

    const url = await getPortalBaseUrl();
    assert.equal(
      url,
      "https://setting-wins.example.com",
      "system_setting must take precedence over env var per portal-url.ts contract",
    );
  });
});
