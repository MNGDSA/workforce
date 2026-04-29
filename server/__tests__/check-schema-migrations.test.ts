/**
 * Tests for `scripts/check-schema-migrations.mjs` (Task #234).
 *
 * The script is invoked as a subprocess against fixture directories so that
 * positive and negative paths can be exercised without touching the real
 * `shared/schema.ts` / ensure-script tree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.resolve(
  process.cwd(),
  "scripts/check-schema-migrations.mjs",
);

interface FixtureFiles {
  schema: string;
  snapshot: object;
  /** filename -> content for files placed in the ensure dir */
  ensure?: Record<string, string>;
  /** filename -> content for files placed in the drizzle SQL dir */
  drizzleSql?: Record<string, string>;
  allowlist?: object;
}

function makeFixture(files: FixtureFiles): {
  dir: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-check-"));
  const schemaPath = path.join(dir, "schema.ts");
  const snapshotPath = path.join(dir, "0000_snapshot.json");
  const ensureDir = path.join(dir, "ensure");
  const sqlDir = path.join(dir, "sql");
  const allowlistPath = path.join(dir, "allowlist.json");

  fs.writeFileSync(schemaPath, files.schema);
  fs.writeFileSync(snapshotPath, JSON.stringify(files.snapshot));
  fs.mkdirSync(ensureDir, { recursive: true });
  fs.mkdirSync(sqlDir, { recursive: true });
  for (const [name, body] of Object.entries(files.ensure ?? {})) {
    fs.writeFileSync(path.join(ensureDir, name), body);
  }
  for (const [name, body] of Object.entries(files.drizzleSql ?? {})) {
    fs.writeFileSync(path.join(sqlDir, name), body);
  }
  if (files.allowlist) {
    fs.writeFileSync(allowlistPath, JSON.stringify(files.allowlist));
  }

  return {
    dir,
    env: {
      ...process.env,
      CHECK_SCHEMA_PATH: schemaPath,
      CHECK_SNAPSHOT_PATH: snapshotPath,
      CHECK_ENSURE_DIR: ensureDir,
      CHECK_DRIZZLE_SQL_DIR: sqlDir,
      CHECK_ALLOWLIST_PATH: files.allowlist ? allowlistPath : "/nonexistent",
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

const baselineSnapshot = {
  tables: {
    "public.widgets": {
      name: "widgets",
      columns: {
        id: { name: "id", type: "varchar" },
        name: { name: "name", type: "text" },
      },
    },
  },
};

const baselineSchema = `import { pgTable, text, varchar } from "drizzle-orm/pg-core";
export const widgets = pgTable("widgets", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
});
`;

test("passes when schema matches baseline exactly", () => {
  const fx = makeFixture({
    schema: baselineSchema,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /Schema migration coverage OK/);
  } finally {
    fx.cleanup();
  }
});

test("fails when a new column has no ensure-script", () => {
  const schemaWithNew = baselineSchema.replace(
    `name: text("name").notNull(),`,
    `name: text("name").notNull(),
  color: text("color"),`,
  );
  const fx = makeFixture({
    schema: schemaWithNew,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /widgets\.color/);
    assert.match(r.stderr, /no\s+server\/migrations\/ensure-\*\.ts/);
  } finally {
    fx.cleanup();
  }
});

test("passes when a matching ensure-*.ts file covers the new column", () => {
  const schemaWithNew = baselineSchema.replace(
    `name: text("name").notNull(),`,
    `name: text("name").notNull(),
  color: text("color"),`,
  );
  const fx = makeFixture({
    schema: schemaWithNew,
    snapshot: baselineSnapshot,
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
  } finally {
    fx.cleanup();
  }
});

test("does NOT count ALTER TABLE in non-ensure-prefixed .ts files", () => {
  // Reviewer-flagged regression: a one-shot/backfill script with an
  // ALTER TABLE must NOT satisfy coverage, because it doesn't run on every
  // boot. Only `ensure-*.ts` scripts are part of the boot-migrate contract.
  const schemaWithNew = baselineSchema.replace(
    `name: text("name").notNull(),`,
    `name: text("name").notNull(),
  color: text("color"),`,
  );
  const fx = makeFixture({
    schema: schemaWithNew,
    snapshot: baselineSnapshot,
    ensure: {
      // Note: NOT prefixed with ensure-. This is a one-shot migration.
      "001-backfill-widget-color.ts": `
        import { sql } from "drizzle-orm";
        export async function backfill(log) {
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS color TEXT\`);
        }
      `,
      "migrate-to-widgets-v2.ts": `
        await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS color TEXT\`);
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(
      r.status,
      1,
      "non-ensure-* files must not satisfy coverage",
    );
    assert.match(r.stderr, /widgets\.color/);
  } finally {
    fx.cleanup();
  }
});

test("counts ALTER TABLE in drizzle migration .sql files (excluding 0000_initial.sql)", () => {
  const schemaWithNew = baselineSchema.replace(
    `name: text("name").notNull(),`,
    `name: text("name").notNull(),
  color: text("color"),`,
  );
  const fx = makeFixture({
    schema: schemaWithNew,
    snapshot: baselineSnapshot,
    drizzleSql: {
      "0001_add_color.sql":
        "ALTER TABLE widgets ADD COLUMN IF NOT EXISTS color text;",
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
  } finally {
    fx.cleanup();
  }
});

test("fails when a new table has no CREATE TABLE coverage", () => {
  const schemaWithNewTable =
    baselineSchema +
    `
export const gizmos = pgTable("gizmos", {
  id: varchar("id").primaryKey(),
  label: text("label"),
});
`;
  const fx = makeFixture({
    schema: schemaWithNewTable,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Table "gizmos"/);
  } finally {
    fx.cleanup();
  }
});

test("allowlist suppresses pre-existing gaps", () => {
  const schemaWithNew = baselineSchema.replace(
    `name: text("name").notNull(),`,
    `name: text("name").notNull(),
  color: text("color"),`,
  );
  const fx = makeFixture({
    schema: schemaWithNew,
    snapshot: baselineSnapshot,
    allowlist: {
      newColumns: { widgets: ["color"] },
      newTables: [],
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /pre-existing gap\(s\) suppressed/);
  } finally {
    fx.cleanup();
  }
});

test("rejects non-idempotent ALTER inside an ensure-*.ts file", () => {
  // Reviewer-flagged hardening: ensure-* scripts run on every boot, so any
  // ADD COLUMN without IF NOT EXISTS would crash on the second startup.
  // Such statements must NOT satisfy coverage.
  const schemaWithNew = baselineSchema.replace(
    `name: text("name").notNull(),`,
    `name: text("name").notNull(),
  color: text("color"),`,
  );
  const fx = makeFixture({
    schema: schemaWithNew,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-color.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetColor(log) {
          // Non-idempotent — would crash on second boot.
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN color TEXT\`);
        }
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Non-idempotent statements/);
    assert.match(r.stderr, /ensure-widget-color\.ts/);
    assert.match(r.stderr, /missing IF NOT EXISTS/);
  } finally {
    fx.cleanup();
  }
});

test("fails on stale allowlist entries (gap no longer present)", () => {
  // Allowlist claims widgets.color is a gap, but the schema doesn't have it.
  const fx = makeFixture({
    schema: baselineSchema,
    snapshot: baselineSnapshot,
    allowlist: {
      newColumns: { widgets: ["color"] },
      newTables: ["ghost_table"],
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /stale entries/);
    assert.match(r.stderr, /widgets\.color/);
    assert.match(r.stderr, /ghost_table/);
  } finally {
    fx.cleanup();
  }
});
