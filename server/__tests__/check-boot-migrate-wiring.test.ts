/**
 * Tests for `scripts/check-boot-migrate-wiring.mjs` (Task #236).
 *
 * The script is invoked as a subprocess against fixture directories so that
 * positive and negative paths can be exercised without touching the real
 * `server/index.ts` / ensure-script tree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(
  process.cwd(),
  "scripts/check-boot-migrate-wiring.mjs",
);

const MARKER = "// @boot-migrate-block";

interface FixtureFiles {
  /** content of the synthetic server/index.ts */
  index: string;
  /** filename -> content for files placed in the ensure dir */
  ensure?: Record<string, string>;
}

function makeFixture(files: FixtureFiles): {
  dir: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiring-check-"));
  const indexPath = path.join(dir, "index.ts");
  const ensureDir = path.join(dir, "ensure");

  fs.writeFileSync(indexPath, files.index);
  fs.mkdirSync(ensureDir, { recursive: true });
  for (const [name, body] of Object.entries(files.ensure ?? {})) {
    fs.writeFileSync(path.join(ensureDir, name), body);
  }

  return {
    dir,
    env: {
      ...process.env,
      CHECK_INDEX_PATH: indexPath,
      CHECK_ENSURE_DIR: ensureDir,
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

function run(env: NodeJS.ProcessEnv): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const res = spawnSync("node", [SCRIPT], { env, encoding: "utf-8" });
  return {
    status: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

test("passes when every ensure-script's export is awaited from a marked block", () => {
  const fx = makeFixture({
    index: `
      ${MARKER}
      try {
        const { ensureWidgetColor } = await import("./migrations/ensure-widget-color");
        await ensureWidgetColor(log);
      } catch (err) {
        log("boot migration failed: " + err, "boot-migrate");
      }
    `,
    ensure: {
      "ensure-widget-color.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetColor(log) {
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS color TEXT\`);
        }
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /Boot-migrate wiring OK/);
    assert.match(r.stdout, /1 wired, 0 opt-out/);
    assert.match(r.stdout, /1 `@boot-migrate-block` block/);
  } finally {
    fx.cleanup();
  }
});

test("fails when an ensure-script is imported but never awaited", () => {
  // The contributor remembered the import but forgot the await — the
  // function still never runs at boot, so production crashes.
  const fx = makeFixture({
    index: `
      ${MARKER}
      try {
        const { ensureWidgetColor } = await import("./migrations/ensure-widget-color");
        // Oops — forgot to call ensureWidgetColor(log).
      } catch (err) {}
    `,
    ensure: {
      "ensure-widget-color.ts": `
        export async function ensureWidgetColor(log) {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ensure-widget-color\.ts/);
    assert.match(r.stderr, /none of \[ensureWidgetColor\] is awaited/);
  } finally {
    fx.cleanup();
  }
});

test("fails when an ensure-script is created but never imported at all", () => {
  const fx = makeFixture({
    index: `
      ${MARKER}
      try {
        // empty boot-migrate block
      } catch (err) {}
    `,
    ensure: {
      "ensure-widget-color.ts": `
        export async function ensureWidgetColor(log) {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ensure-widget-color\.ts/);
    assert.match(r.stderr, /server\/index\.ts/);
  } finally {
    fx.cleanup();
  }
});

test("does not count an awaited ensure-call outside any marked block", () => {
  // Reviewer-flagged hardening: the check must scope to the boot-migrate
  // try/catch only. An `await ensureFoo(...)` in unrelated startup code,
  // route handlers, or any future helper must NOT satisfy wiring.
  const fx = makeFixture({
    index: `
      ${MARKER}
      try {
        // empty — the real call is below in unrelated code
      } catch (err) {}

      // Some unrelated startup code (e.g. a future route handler).
      try {
        await ensureWidgetColor(log);
      } catch (err) {}
    `,
    ensure: {
      "ensure-widget-color.ts": `
        export async function ensureWidgetColor(log) {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /none of \[ensureWidgetColor\] is awaited/);
  } finally {
    fx.cleanup();
  }
});

test("does not count an awaited ensure-call inside a comment", () => {
  // A commented-out invocation must not satisfy wiring, otherwise the
  // check is trivially defeated by a stray review comment.
  const fx = makeFixture({
    index: `
      ${MARKER}
      try {
        // await ensureWidgetColor(log);
        /* await ensureWidgetColor(log); */
      } catch (err) {}
    `,
    ensure: {
      "ensure-widget-color.ts": `
        export async function ensureWidgetColor(log) {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /none of \[ensureWidgetColor\] is awaited/);
  } finally {
    fx.cleanup();
  }
});

test("does not count an awaited ensure-call inside a string literal", () => {
  // Reviewer-flagged hardening: a docstring / log message containing
  // `"await ensureWidgetColor(log)"` must not satisfy wiring. Cover all
  // three quote styles.
  const fx = makeFixture({
    index: `
      ${MARKER}
      try {
        const docs = "await ensureWidgetColor(log)";
        const more = 'await ensureWidgetColor(log)';
        const tpl  = \`await ensureWidgetColor(log)\`;
      } catch (err) {}
    `,
    ensure: {
      "ensure-widget-color.ts": `
        export async function ensureWidgetColor(log) {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /none of \[ensureWidgetColor\] is awaited/);
  } finally {
    fx.cleanup();
  }
});

test("DOES count an awaited call inside a template-literal interpolation", () => {
  // Inside `${ ... }` we are back to executable code — an await there
  // would actually run, so it must satisfy wiring.
  const fx = makeFixture({
    index: `
      ${MARKER}
      try {
        log(\`done: \${await ensureWidgetColor(log)}\`);
      } catch (err) {}
    `,
    ensure: {
      "ensure-widget-color.ts": `
        export async function ensureWidgetColor(log) {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  } finally {
    fx.cleanup();
  }
});

test("respects the @boot-migrate-optional opt-out marker", () => {
  // Some ensure-scripts are intentionally one-shot (e.g. an RBAC backfill).
  // The opt-out marker exempts them from the wiring requirement.
  const fx = makeFixture({
    index: `${MARKER}\n      try {} catch (err) {}`,
    ensure: {
      "ensure-rbac-backfill.ts": `
        /**
         * One-shot RBAC backfill. Run manually with tsx.
         * @boot-migrate-optional
         */
        export async function ensureRbacBackfill(log) {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /1 ensure-script\(s\) checked/);
    assert.match(r.stdout, /0 wired, 1 opt-out/);
  } finally {
    fx.cleanup();
  }
});

test("only inspects files matching the ensure-*.ts naming convention", () => {
  // A one-shot script that is NOT named `ensure-*.ts` (e.g. migrate-to-rbac.ts
  // or 001-backfill.ts) is outside the boot-migrate contract entirely and
  // must not be flagged as unwired.
  const fx = makeFixture({
    index: `${MARKER}\n      try {} catch (err) {}`,
    ensure: {
      "migrate-to-rbac.ts": `
        export async function migrateToRbac() {}
      `,
      "001-backfill.ts": `
        export async function backfill() {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /0 ensure-script\(s\) checked/);
  } finally {
    fx.cleanup();
  }
});

test("fails when an ensure-*.ts file has no export at all", () => {
  // A bare ensure script with no exported async function is almost
  // certainly a partially-written file and should not silently pass.
  const fx = makeFixture({
    index: `${MARKER}\n      try {} catch (err) {}`,
    ensure: {
      "ensure-empty.ts": `
        // TODO: add the ALTER TABLE
        const x = 1;
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no `export async function`/);
  } finally {
    fx.cleanup();
  }
});

test("passes when one of multiple exports is wired", () => {
  // Some ensure files export several helpers; wiring just one of them
  // is enough — the script will still execute end-to-end at boot.
  const fx = makeFixture({
    index: `${MARKER}\n      try { await ensureMain(log); } catch (err) {}`,
    ensure: {
      "ensure-multi.ts": `
        export async function ensureHelper() {}
        export async function ensureMain(log) {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  } finally {
    fx.cleanup();
  }
});

test("supports multiple @boot-migrate-block markers (e.g. patches + critical-tables)", () => {
  // server/index.ts has TWO marked blocks today: the schema-patches block
  // and the ensure-critical-tables safety net. Each script's wiring should
  // be satisfied by ANY marked block.
  const fx = makeFixture({
    index: `
      ${MARKER}
      try {
        await ensureLocale(log);
      } catch (err) {}

      ${MARKER}
      try {
        await ensureCritical(log);
      } catch (err) {}
    `,
    ensure: {
      "ensure-locale.ts": `export async function ensureLocale(log) {}`,
      "ensure-critical.ts": `export async function ensureCritical(log) {}`,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /2 wired/);
    assert.match(r.stdout, /2 `@boot-migrate-block` block/);
  } finally {
    fx.cleanup();
  }
});

test("fails with a helpful message when no @boot-migrate-block marker exists", () => {
  // If a refactor accidentally removes both markers, the check must fail
  // loudly rather than silently flag every ensure-script as unwired.
  const fx = makeFixture({
    index: `
      try {
        await ensureWidgetColor(log);
      } catch (err) {}
    `,
    ensure: {
      "ensure-widget-color.ts": `
        export async function ensureWidgetColor(log) {}
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /No `\/\/ @boot-migrate-block` marker found/);
  } finally {
    fx.cleanup();
  }
});
