/**
 * Tests for `scripts/check-schema-indexes.mjs` (Task #237).
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
  "scripts/check-schema-indexes.mjs",
);

interface FixtureFiles {
  schema: string;
  snapshot: object;
  /** filename -> content for files placed in the ensure dir */
  ensure?: Record<string, string>;
  /**
   * filename -> content for files placed in the drizzle SQL dir. Used only
   * to prove that drizzle SQL coverage does NOT satisfy the check —
   * `migrations/*.sql` is intentionally not scanned because production
   * deploys do not run drizzle-kit migrate/push.
   */
  drizzleSql?: Record<string, string>;
  allowlist?: object;
}

function makeFixture(files: FixtureFiles): {
  dir: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-idx-check-"));
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
      CHECK_INDEX_ALLOWLIST_PATH: files.allowlist
        ? allowlistPath
        : "/nonexistent",
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
      indexes: {
        widgets_name_idx: { name: "widgets_name_idx" },
      },
      compositePrimaryKeys: {},
      checkConstraints: {},
      uniqueConstraints: {},
    },
  },
};

const baselineSchema = `import { pgTable, text, varchar, index } from "drizzle-orm/pg-core";
export const widgets = pgTable(
  "widgets",
  {
    id: varchar("id").primaryKey(),
    name: text("name").notNull(),
  },
  (t) => ({
    nameIdx: index("widgets_name_idx").on(t.name),
  })
);
`;

test("passes when schema indexes match baseline exactly", () => {
  const fx = makeFixture({
    schema: baselineSchema,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.match(r.stdout, /Schema index\/constraint coverage OK/);
  } finally {
    fx.cleanup();
  }
});

test("fails when a new uniqueIndex has no ensure-script", () => {
  const schemaWithNewIdx = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    colorIdx: uniqueIndex("widgets_color_idx").on(t.name),`,
  );
  const fx = makeFixture({
    schema: schemaWithNewIdx,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /widgets_color_idx/);
    assert.match(r.stderr, /CREATE UNIQUE INDEX IF NOT EXISTS/);
    assert.match(r.stderr, /silently insert duplicates/);
  } finally {
    fx.cleanup();
  }
});

test("fails when a new non-unique index has no ensure-script", () => {
  const schemaWithNewIdx = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    extraIdx: index("widgets_extra_idx").on(t.id),`,
  );
  const fx = makeFixture({
    schema: schemaWithNewIdx,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /widgets_extra_idx/);
    // Non-unique index error should NOT include the duplicate-insert footnote.
    assert.doesNotMatch(r.stderr, /silently insert duplicates/);
  } finally {
    fx.cleanup();
  }
});

test("passes when a matching ensure-*.ts CREATE [UNIQUE] INDEX IF NOT EXISTS covers the new index", () => {
  const schemaWithNewIdx = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    colorIdx: uniqueIndex("widgets_color_idx").on(t.name),`,
  );
  const fx = makeFixture({
    schema: schemaWithNewIdx,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-color-idx.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetColorIdx(log) {
          await db.execute(sql\`CREATE UNIQUE INDEX IF NOT EXISTS widgets_color_idx ON widgets (name)\`);
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

test("fails when a uniqueIndex is 'covered' by a non-UNIQUE CREATE INDEX of the same name", () => {
  // Reviewer-flagged correctness hole: a `uniqueIndex(...)` schema
  // declaration MUST be matched by `CREATE UNIQUE INDEX ...`. Accepting a
  // bare `CREATE INDEX <same-name>` would install a non-unique index in
  // production, silently dropping the uniqueness guarantee that any upsert
  // / ON CONFLICT path relies on (duplicate rows would be inserted).
  const schemaWithNewIdx = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    colorIdx: uniqueIndex("widgets_color_idx").on(t.name),`,
  );
  const fx = makeFixture({
    schema: schemaWithNewIdx,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-color-idx.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetColorIdx(log) {
          await db.execute(sql\`CREATE INDEX IF NOT EXISTS widgets_color_idx ON widgets (name)\`);
        }
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(
      r.status,
      1,
      "uniqueIndex covered only by non-UNIQUE CREATE INDEX must fail",
    );
    assert.match(r.stderr, /widgets_color_idx/);
    assert.match(r.stderr, /NOT marked UNIQUE/);
    assert.match(r.stderr, /silently insert duplicates/);
  } finally {
    fx.cleanup();
  }
});

test("passes when a non-unique index() is covered by a non-UNIQUE CREATE INDEX (uniqueness only required for uniqueIndex)", () => {
  // Symmetric to the test above: a plain `index(...)` declaration is happy
  // with either UNIQUE or non-UNIQUE coverage. Only `uniqueIndex(...)`
  // requires the UNIQUE keyword in the SQL.
  const schemaWithNewIdx = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    extraIdx: index("widgets_extra_idx").on(t.id),`,
  );
  const fx = makeFixture({
    schema: schemaWithNewIdx,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-extra-idx.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetExtraIdx(log) {
          await db.execute(sql\`CREATE INDEX IF NOT EXISTS widgets_extra_idx ON widgets (id)\`);
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

test("rejects bare CREATE INDEX (no IF NOT EXISTS) inside an ensure-*.ts file", () => {
  // Boot-migrate scripts re-run on every startup. A bare CREATE INDEX would
  // crash the second boot with `relation "..." already exists`.
  const schemaWithNewIdx = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    colorIdx: uniqueIndex("widgets_color_idx").on(t.name),`,
  );
  const fx = makeFixture({
    schema: schemaWithNewIdx,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-color-idx.ts": `
        import { sql } from "drizzle-orm";
        export async function ensureWidgetColorIdx(log) {
          await db.execute(sql\`CREATE UNIQUE INDEX widgets_color_idx ON widgets (name)\`);
        }
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Non-idempotent statements/);
    assert.match(r.stderr, /ensure-widget-color-idx\.ts/);
    assert.match(r.stderr, /missing IF NOT EXISTS/);
  } finally {
    fx.cleanup();
  }
});

test("does NOT count CREATE INDEX in non-ensure-prefixed .ts files", () => {
  const schemaWithNewIdx = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    colorIdx: uniqueIndex("widgets_color_idx").on(t.name),`,
  );
  const fx = makeFixture({
    schema: schemaWithNewIdx,
    snapshot: baselineSnapshot,
    ensure: {
      "001-add-widget-color-idx.ts": `
        await db.execute(sql\`CREATE UNIQUE INDEX IF NOT EXISTS widgets_color_idx ON widgets (name)\`);
      `,
      "migrate-widgets-v2.ts": `
        await db.execute(sql\`CREATE UNIQUE INDEX IF NOT EXISTS widgets_color_idx ON widgets (name)\`);
      `,
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1, "non-ensure-* files must not satisfy coverage");
    assert.match(r.stderr, /widgets_color_idx/);
  } finally {
    fx.cleanup();
  }
});

test("does NOT count CREATE INDEX in drizzle .sql migration files (production never runs them)", () => {
  // Reviewer-flagged correctness: production deploys do not run
  // `drizzle-kit migrate` / push, so a CREATE INDEX that lives only in
  // `migrations/*.sql` would never reach prod. Accepting that as coverage
  // would preserve the exact failure mode this task was created to prevent.
  // Only `server/migrations/ensure-*.ts` files (which run on every server
  // boot via the boot-migrate try/catch) satisfy coverage.
  const schemaWithNewIdx = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    colorIdx: uniqueIndex("widgets_color_idx").on(t.name),`,
  );
  const fx = makeFixture({
    schema: schemaWithNewIdx,
    snapshot: baselineSnapshot,
    drizzleSql: {
      "0001_add_widget_color_idx.sql":
        "CREATE UNIQUE INDEX IF NOT EXISTS widgets_color_idx ON widgets (name);",
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(
      r.status,
      1,
      "drizzle .sql files must not satisfy production coverage",
    );
    assert.match(r.stderr, /widgets_color_idx/);
  } finally {
    fx.cleanup();
  }
});

test("passes when an index lives on a brand-new table that has CREATE TABLE IF NOT EXISTS coverage", () => {
  const schemaWithNewTable =
    baselineSchema +
    `
export const gizmos = pgTable(
  "gizmos",
  {
    id: varchar("id").primaryKey(),
    label: text("label"),
  },
  (t) => ({
    labelIdx: uniqueIndex("gizmos_label_idx").on(t.label),
  })
);
`;
  const fx = makeFixture({
    schema: schemaWithNewTable,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-gizmos-table.ts": `
        export async function ensureGizmosTable(log) {
          await db.execute(sql\`
            CREATE TABLE IF NOT EXISTS gizmos (
              id varchar PRIMARY KEY,
              label text,
              CONSTRAINT gizmos_label_idx UNIQUE (label)
            )
          \`);
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

test("fails when an index lives on a brand-new table without CREATE TABLE coverage", () => {
  const schemaWithNewTable =
    baselineSchema +
    `
export const gizmos = pgTable(
  "gizmos",
  {
    id: varchar("id").primaryKey(),
    label: text("label"),
  },
  (t) => ({
    labelIdx: uniqueIndex("gizmos_label_idx").on(t.label),
  })
);
`;
  const fx = makeFixture({
    schema: schemaWithNewTable,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /gizmos_label_idx/);
  } finally {
    fx.cleanup();
  }
});

test("fails when a new check constraint has no ensure-script", () => {
  const schemaWithCheck = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    nameNonEmpty: check("widgets_name_non_empty", sql\`length(name) > 0\`),`,
  );
  const fx = makeFixture({
    schema: schemaWithCheck,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /widgets_name_non_empty/);
    assert.match(r.stderr, /\(check\)/);
    assert.match(r.stderr, /ADD CONSTRAINT/);
  } finally {
    fx.cleanup();
  }
});

test("passes when a new check constraint is covered by an ADD CONSTRAINT in an ensure-*.ts file", () => {
  const schemaWithCheck = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    nameNonEmpty: check("widgets_name_non_empty", sql\`length(name) > 0\`),`,
  );
  const fx = makeFixture({
    schema: schemaWithCheck,
    snapshot: baselineSnapshot,
    ensure: {
      "ensure-widget-name-check.ts": `
        export async function ensureWidgetNameCheck(log) {
          // Use a DO block so re-running on every boot is safe even though
          // PostgreSQL < 18 doesn't support \`ADD CONSTRAINT IF NOT EXISTS\`.
          await db.execute(sql\`
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'widgets_name_non_empty') THEN
                ALTER TABLE widgets ADD CONSTRAINT widgets_name_non_empty CHECK (length(name) > 0);
              END IF;
            END $$;
          \`);
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

test("fails when a named composite primaryKey({ name: ... }) has no ensure-script", () => {
  const schemaWithPk = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    pk: primaryKey({ name: "widgets_composite_pk", columns: [t.id, t.name] }),`,
  );
  const fx = makeFixture({
    schema: schemaWithPk,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /widgets_composite_pk/);
    assert.match(r.stderr, /\(pk\)/);
  } finally {
    fx.cleanup();
  }
});

test("fails when an unnamed primaryKey({ columns: ... }) is added on an existing table", () => {
  // Existing table → unnamed composite PK is rejected outright because we
  // can't reliably check for ADD CONSTRAINT coverage without knowing the
  // auto-generated name.
  const schemaWithUnnamedPk = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    pk: primaryKey({ columns: [t.id, t.name] }),`,
  );
  const fx = makeFixture({
    schema: schemaWithUnnamedPk,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Unnamed primaryKey/);
    assert.match(r.stderr, /widgets/);
  } finally {
    fx.cleanup();
  }
});

test("allowlist suppresses pre-existing index gaps", () => {
  const schemaWithNewIdx = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    colorIdx: uniqueIndex("widgets_color_idx").on(t.name),`,
  );
  const fx = makeFixture({
    schema: schemaWithNewIdx,
    snapshot: baselineSnapshot,
    allowlist: {
      newIndexes: ["widgets_color_idx"],
      newConstraints: [],
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

test("fails on stale allowlist entries (gap no longer present)", () => {
  // Allowlist claims widgets_color_idx is a gap, but the schema doesn't have it.
  const fx = makeFixture({
    schema: baselineSchema,
    snapshot: baselineSnapshot,
    allowlist: {
      newIndexes: ["widgets_color_idx"],
      newConstraints: ["ghost_constraint"],
    },
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /stale entries/);
    assert.match(r.stderr, /widgets_color_idx/);
    assert.match(r.stderr, /ghost_constraint/);
  } finally {
    fx.cleanup();
  }
});

test("treats a comment such as `// uniqueIndex(\"foo\")` as not a real declaration", () => {
  // Reviewer-flagged hardening: the parser must strip JS comments before
  // matching `uniqueIndex(...)` so that an inline note in shared/schema.ts
  // can't accidentally be flagged as a missing index.
  const schemaWithCommented = baselineSchema.replace(
    `nameIdx: index("widgets_name_idx").on(t.name),`,
    `nameIdx: index("widgets_name_idx").on(t.name),
    // historical: uniqueIndex("widgets_legacy_color_idx") was removed in v2`,
  );
  const fx = makeFixture({
    schema: schemaWithCommented,
    snapshot: baselineSnapshot,
  });
  try {
    const r = run(fx.env);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.doesNotMatch(r.stderr, /widgets_legacy_color_idx/);
  } finally {
    fx.cleanup();
  }
});
