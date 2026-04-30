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

// ─── Task #238 — column type mismatch detection ──────────────────────────
//
// The coverage check above only confirms that *some* `ADD COLUMN <col>`
// exists. The tests below exercise the type-mismatch guard added in
// Task #238 — a `boolean` schema column paired with `ADD COLUMN ... TEXT`
// must fail loudly so the bug is caught at PR time instead of returning
// strings to the API at runtime. They cover matching + mismatching
// boolean, pgEnum, and `.array()` cases plus a parameterised-type case
// (VARCHAR(8) ↔ varchar) to confirm the parens are stripped.

test("type-match: boolean schema + boolean ensure-script passes", () => {
  const schemaWithBool = `import { pgTable, text, varchar, boolean } from "drizzle-orm/pg-core";
export const widgets = pgTable("widgets", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(false),
});
`;
  const fx = makeFixture({
    schema: schemaWithBool,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-active.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetActive(log) {
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT false\`);
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

test("type-mismatch: boolean schema + TEXT ensure-script FAILS", () => {
  // Reviewer's stated motivating example: schema declares boolean, the
  // ensure-script accidentally writes TEXT, the old check happily passed
  // and production returned strings to the API.
  const schemaWithBool = `import { pgTable, text, varchar, boolean } from "drizzle-orm/pg-core";
export const widgets = pgTable("widgets", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(false),
});
`;
  const fx = makeFixture({
    schema: schemaWithBool,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-active.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetActive(log) {
          // BUG: schema is boolean but the migration writes TEXT.
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS active TEXT NOT NULL DEFAULT 'false'\`);
        }
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /type mismatch.*widgets\.active/i);
    assert.match(r.stderr, /boolean.*text/i);
    assert.match(r.stderr, /ensure-widget-active\.ts/);
  } finally {
    fx.cleanup();
  }
});

test("type-match: pgEnum schema + matching enum SQL type passes", () => {
  // Drizzle declares the enum like
  //   export const widgetKindEnum = pgEnum("widget_kind", [...])
  // and uses it in a column as `widgetKindEnum("kind")`. The ensure
  // script must spell the underlying SQL type — `widget_kind` — which
  // the schema-type-map looks up via the parsed enum table.
  const schemaWithEnum = `import { pgTable, text, varchar, pgEnum } from "drizzle-orm/pg-core";
export const widgetKindEnum = pgEnum("widget_kind", ["small", "large"]);
export const widgets = pgTable("widgets", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  kind: widgetKindEnum("kind").notNull().default("small"),
});
`;
  const fx = makeFixture({
    schema: schemaWithEnum,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-kind.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetKind(log) {
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS kind widget_kind NOT NULL DEFAULT 'small'\`);
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

test("type-mismatch: pgEnum schema + TEXT ensure-script FAILS", () => {
  const schemaWithEnum = `import { pgTable, text, varchar, pgEnum } from "drizzle-orm/pg-core";
export const widgetKindEnum = pgEnum("widget_kind", ["small", "large"]);
export const widgets = pgTable("widgets", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  kind: widgetKindEnum("kind").notNull(),
});
`;
  const fx = makeFixture({
    schema: schemaWithEnum,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-kind.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetKind(log) {
          // BUG: schema uses widget_kind enum, ensure writes TEXT.
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL\`);
        }
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /type mismatch.*widgets\.kind/i);
    assert.match(r.stderr, /widget_kind/);
  } finally {
    fx.cleanup();
  }
});

test("type-match: text().array() schema + TEXT[] ensure-script passes", () => {
  const schemaWithArray = `import { pgTable, text, varchar } from "drizzle-orm/pg-core";
export const widgets = pgTable("widgets", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  tags: text("tags").array(),
});
`;
  const fx = makeFixture({
    schema: schemaWithArray,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-tags.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetTags(log) {
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS tags TEXT[]\`);
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

test("type-mismatch: text().array() schema + scalar TEXT ensure-script FAILS", () => {
  // Drops the array marker — schema returns string[] from Drizzle, but
  // the column is actually a scalar TEXT in the database. The discrepancy
  // would cause the ORM to attempt array operations on a string column.
  const schemaWithArray = `import { pgTable, text, varchar } from "drizzle-orm/pg-core";
export const widgets = pgTable("widgets", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  tags: text("tags").array(),
});
`;
  const fx = makeFixture({
    schema: schemaWithArray,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-tags.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetTags(log) {
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS tags TEXT\`);
        }
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /type mismatch.*widgets\.tags/i);
    assert.match(r.stderr, /\.array\(\)/);
  } finally {
    fx.cleanup();
  }
});

test("type-match: varchar(8) schema + VARCHAR(8) ensure-script passes (parens stripped)", () => {
  const schemaWithVar = `import { pgTable, text, varchar } from "drizzle-orm/pg-core";
export const widgets = pgTable("widgets", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  locale: varchar("locale", { length: 8 }).notNull().default("ar"),
});
`;
  const fx = makeFixture({
    schema: schemaWithVar,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-locale.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetLocale(log) {
          await db.execute(sql\`ALTER TABLE widgets ADD COLUMN IF NOT EXISTS locale VARCHAR(8) NOT NULL DEFAULT 'ar'\`);
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
