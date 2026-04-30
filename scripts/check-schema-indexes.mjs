#!/usr/bin/env node
/**
 * Task #237 — Schema index/constraint migration coverage check.
 *
 * Sibling to `scripts/check-schema-migrations.mjs` (Task #234) and
 * `scripts/check-boot-migrate-wiring.mjs` (Task #236). Those two only inspect
 * `ALTER TABLE ... ADD COLUMN` and `CREATE TABLE` statements. Index-only and
 * constraint-only changes (e.g. a new `uniqueIndex(...)` the application
 * relies on for upserts, a new `check("...", sql\`...\`)` invariant, or a
 * named composite `primaryKey({ name: "...", columns: [...] })`) can still
 * land in `shared/schema.ts` without an ensure-script and silently fail in
 * production with `relation "..._idx" does not exist` or with the upsert
 * actually inserting duplicates because the unique index is missing.
 *
 * This check fails the build when:
 *   1. A `uniqueIndex("name")` or `index("name")` declaration in
 *      `shared/schema.ts` is not present in the baseline drizzle snapshot
 *      (`migrations/meta/0000_snapshot.json`) AND no
 *      `CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] <name>`
 *      statement exists in any `server/migrations/ensure-*.ts` file.
 *   2. A `check("name", ...)` declaration (or a named
 *      `primaryKey({ name: "name", ... })`) is not in baseline AND no
 *      `ADD CONSTRAINT [IF NOT EXISTS] <name>` covers it (in an
 *      `ensure-*.ts` file).
 *   3. An `ensure-*.ts` script contains a non-idempotent `CREATE INDEX`
 *      (i.e. missing `IF NOT EXISTS`). Boot-migrate scripts run on every
 *      server start, so a bare `CREATE INDEX` would crash the second boot
 *      with `relation "..." already exists`.
 *
 * NOTE: `migrations/*.sql` files are intentionally NOT scanned for
 * coverage. Production deploys do not run `drizzle-kit migrate` /
 * `drizzle-kit push`, so a CREATE INDEX that lives only in a drizzle
 * `.sql` file would never reach production — accepting that as coverage
 * would preserve the exact failure mode this task was created to prevent.
 * Only `server/migrations/ensure-*.ts` (which runs at every server boot
 * via the `// @boot-migrate-block` try/catch in `server/index.ts`) counts
 * toward coverage.
 *
 * Indexes / constraints declared on a brand-new table are treated as covered
 * implicitly when the table itself has `CREATE TABLE IF NOT EXISTS` coverage
 * — the same lenience the column check applies.
 *
 * Run locally:  node scripts/check-schema-indexes.mjs
 * Runs in CI on every PR via `.github/workflows/test.yml`.
 *
 * See `server/migrations/README.md` for the boot-migrate convention.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Paths can be overridden via env vars for fixture-based testing
// (see server/__tests__/check-schema-indexes.test.ts). When unset, the real
// project paths are used.
const schemaPath =
  process.env.CHECK_SCHEMA_PATH ?? path.join(projectRoot, "shared", "schema.ts");
const snapshotPath =
  process.env.CHECK_SNAPSHOT_PATH ??
  path.join(projectRoot, "migrations", "meta", "0000_snapshot.json");
const ensureDir =
  process.env.CHECK_ENSURE_DIR ?? path.join(projectRoot, "server", "migrations");
const allowlistPath =
  process.env.CHECK_INDEX_ALLOWLIST_PATH ??
  path.join(projectRoot, "scripts", "schema-index-allowlist.json");

// ─── 0. Allowlist of pre-existing gaps ─────────────────────────────────────
// Indexes / constraints that landed in `shared/schema.ts` before this check
// existed. New additions MUST add an ensure-script instead of growing this
// list — that's the whole point of the check.
let allowlist = { newIndexes: [], newConstraints: [] };
if (fs.existsSync(allowlistPath)) {
  const raw = JSON.parse(fs.readFileSync(allowlistPath, "utf-8"));
  allowlist = {
    newIndexes: raw.newIndexes ?? [],
    newConstraints: raw.newConstraints ?? [],
  };
}
const allowedIndexes = new Set(allowlist.newIndexes);
const allowedConstraints = new Set(allowlist.newConstraints);

// ─── 1. Baseline name sets from drizzle snapshot ───────────────────────────
if (!fs.existsSync(snapshotPath)) {
  console.error(
    `Baseline snapshot missing: ${path.relative(projectRoot, snapshotPath)}`,
  );
  process.exit(2);
}
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
/** @type {Set<string>} */
const baselineIndexes = new Set();
/** @type {Set<string>} */
const baselineConstraints = new Set();
/** @type {Set<string>} */
const baselineTables = new Set();
for (const tableEntry of Object.values(snapshot.tables ?? {})) {
  baselineTables.add(tableEntry.name);
  for (const k of Object.keys(tableEntry.indexes ?? {})) baselineIndexes.add(k);
  for (const k of Object.keys(tableEntry.compositePrimaryKeys ?? {})) {
    baselineConstraints.add(k);
  }
  for (const k of Object.keys(tableEntry.checkConstraints ?? {})) {
    baselineConstraints.add(k);
  }
  // Column-level `.unique()` produces snapshot.uniqueConstraints. Those are
  // tied to the column's lifetime and are covered indirectly by the column
  // check (Task #234) — adding a new `.unique()` on an existing column is
  // not a pattern this script tries to police.
}

// ─── 2. Helpers ────────────────────────────────────────────────────────────

/**
 * Strip JS line and block comments while preserving string contents
 * (single-quote, double-quote, and template literals). The output is
 * shorter than the input only by the bytes removed. We strip comments
 * because a comment such as `// uniqueIndex("foo")` would otherwise
 * cause a false positive for the table-options regex below.
 *
 * @param {string} src
 * @returns {string}
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === "/" && nx === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && nx === "*") {
      i += 2;
      while (i < src.length - 1 && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      out += ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i];
          if (i + 1 < src.length) out += src[i + 1];
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Walk forward from `openIdx` (a position holding `openCh`) and return the
 * index of the matching `closeCh`. Skips string literals (single, double,
 * backtick) so braces/parens inside strings do not perturb the depth.
 * Comments must already be stripped before calling.
 *
 * @param {string} src
 * @param {number} openIdx index of the opening bracket
 * @param {string} openCh
 * @param {string} closeCh
 * @returns {number} index of the matching close, or -1 if unbalanced
 */
function findMatching(src, openIdx, openCh, closeCh) {
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

// ─── 3. Parse shared/schema.ts for declared indexes / constraints ──────────
const schemaSrcRaw = fs.readFileSync(schemaPath, "utf-8");
const schemaSrc = stripComments(schemaSrcRaw);

/** @type {Map<string, { table: string, isUnique: boolean }>} */
const declaredIndexes = new Map();
/** @type {Map<string, { table: string, kind: "pk" | "check" }>} */
const declaredConstraints = new Map();
/** @type {Array<{ table: string }>} */
const unnamedCompositePks = [];
/** @type {Set<string>} */
const declaredTables = new Set();

const tableRegex = /pgTable\(\s*"([^"]+)"\s*,\s*\{/g;
let m;
while ((m = tableRegex.exec(schemaSrc)) !== null) {
  const tableName = m[1];
  declaredTables.add(tableName);
  // tableRegex consumed the `{` of the columns block.
  const openBrace = tableRegex.lastIndex - 1;
  const closeBrace = findMatching(schemaSrc, openBrace, "{", "}");
  if (closeBrace === -1) {
    console.error(
      `Could not parse columns block for table "${tableName}" in shared/schema.ts`,
    );
    process.exit(2);
  }
  // Find the open paren of `pgTable(` so we can locate the matching `)` of
  // the call. The match starts at `pgTable`, so `(` is the next char after
  // the literal `pgTable`. Use indexOf to be robust to optional whitespace.
  const openParen = schemaSrc.indexOf("(", m.index);
  const closeParen = findMatching(schemaSrc, openParen, "(", ")");
  if (closeParen === -1) {
    console.error(
      `Could not find closing ) for pgTable("${tableName}") in shared/schema.ts`,
    );
    process.exit(2);
  }
  // The table-options block is whatever sits between the close of the
  // columns object and the close of the pgTable(...) call.
  const optionsBlock = schemaSrc.slice(closeBrace + 1, closeParen);

  // Indexes:  uniqueIndex("name")  /  index("name")
  // The `\b` boundary prevents `uniqueIndex(` from also matching the
  // `index(` regex (the `I` is preceded by `e`, a word char).
  const reIndex = /\b(uniqueIndex|index)\(\s*"([^"]+)"/g;
  let im;
  while ((im = reIndex.exec(optionsBlock)) !== null) {
    declaredIndexes.set(im[2], {
      table: tableName,
      isUnique: im[1] === "uniqueIndex",
    });
  }

  // Check constraints:  check("name", sql`...`)
  const reCheck = /\bcheck\(\s*"([^"]+)"/g;
  let cm;
  while ((cm = reCheck.exec(optionsBlock)) !== null) {
    declaredConstraints.set(cm[1], { table: tableName, kind: "check" });
  }

  // Composite primary keys:  primaryKey({ name: "...", columns: [...] })
  // Only NAMED composite PKs are tracked individually; an unnamed
  // primaryKey({ columns: [...] }) is OK only when the table itself has
  // CREATE TABLE coverage (drizzle auto-generates a name we cannot reliably
  // reproduce here, and existing tables should not have unnamed composite
  // PKs added without an explicit name + ensure-script anyway).
  const rePk = /\bprimaryKey\(\s*\{/g;
  let pm;
  while ((pm = rePk.exec(optionsBlock)) !== null) {
    const obStart = rePk.lastIndex - 1;
    const obEnd = findMatching(optionsBlock, obStart, "{", "}");
    if (obEnd === -1) continue;
    const body = optionsBlock.slice(obStart + 1, obEnd);
    const nameMatch = body.match(/\bname\s*:\s*"([^"]+)"/);
    if (nameMatch) {
      declaredConstraints.set(nameMatch[1], {
        table: tableName,
        kind: "pk",
      });
    } else {
      unnamedCompositePks.push({ table: tableName });
    }
    // Resume the outer search past this primaryKey({...}) so we don't
    // re-scan the inner braces.
    rePk.lastIndex = obEnd + 1;
  }

  tableRegex.lastIndex = closeParen + 1;
}

if (declaredTables.size === 0) {
  console.error(
    "Parsed 0 tables from shared/schema.ts — the parser regex is likely out of date.",
  );
  process.exit(2);
}

// ─── 4. Scan ensure-*.ts files for coverage ────────────────────────────────
/**
 * Coverage is tracked unique-vs-non-unique because a `uniqueIndex(...)`
 * declaration in shared/schema.ts MUST be covered by a `CREATE UNIQUE
 * INDEX ...` — accepting a plain `CREATE INDEX <same-name>` would let
 * production silently skip the uniqueness guarantee that upserts and
 * dedupe paths rely on (e.g. duplicate rows on `INSERT ... ON CONFLICT`).
 * @type {Map<string, { isUnique: boolean }>}
 */
const coveredIndexes = new Map();
/** @type {Set<string>} */
const coveredConstraints = new Set();
/** @type {Set<string>} */
const newTableCoverage = new Set();
/** @type {string[]} */
const nonIdempotentEnsures = [];

/**
 * @param {string} sql raw source containing SQL
 * @param {{ requireIdempotent: boolean, source: string }} opts
 *   When `requireIdempotent` is true (boot-migrate ensure-*.ts), bare
 *   `CREATE INDEX` (without `IF NOT EXISTS`) is reported because the
 *   script re-runs on every boot. Currently always true — kept as a
 *   parameter for symmetry with the column check and so a future caller
 *   could opt in to scanning a one-shot context.
 */
function scanSqlForCoverage(sql, opts) {
  const { requireIdempotent, source } = opts;
  // Strip SQL line comments. We deliberately don't strip JS string-literal
  // boundaries here — every CREATE/ALTER we care about is the SAME literal
  // text in either a `sql\`...\`` template, a sql.raw(\`...\`), or a plain
  // `.sql` file.
  const cleaned = sql.replace(/--[^\n]*/g, "");

  // CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] <name>
  // Capture the UNIQUE token so we can require it for uniqueIndex(...) decls.
  const reIdx = requireIdempotent
    ? /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?IF\s+NOT\s+EXISTS\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi
    : /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi;
  let im;
  while ((im = reIdx.exec(cleaned)) !== null) {
    const name = im[2];
    const isUnique = Boolean(im[1]);
    const prev = coveredIndexes.get(name);
    // If we somehow see both forms with the same name in different ensure
    // scripts, the UNIQUE form wins — the stricter declaration is what
    // production will end up enforcing once both run.
    coveredIndexes.set(name, { isUnique: isUnique || (prev?.isUnique ?? false) });
  }

  if (requireIdempotent) {
    const reBareIdx =
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?!IF\s+NOT\s+EXISTS)["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi;
    let bm;
    while ((bm = reBareIdx.exec(cleaned)) !== null) {
      nonIdempotentEnsures.push(
        `${source}: CREATE INDEX ${bm[1]} (missing IF NOT EXISTS)`,
      );
    }
  }

  // ADD CONSTRAINT [IF NOT EXISTS] <name>
  // Postgres < 18 doesn't support `IF NOT EXISTS` on ADD CONSTRAINT directly,
  // so contributors typically wrap the ALTER in a `DO $$ ... END $$` guard
  // or a `pg_constraint` lookup. We don't try to validate the wrapper — we
  // just look for the `ADD CONSTRAINT <name>` token, since seeing the name
  // is strong evidence that the migration intended to install it.
  const reCon =
    /ADD\s+CONSTRAINT\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi;
  let conM;
  while ((conM = reCon.exec(cleaned)) !== null) coveredConstraints.add(conM[1]);

  // CREATE TABLE [IF NOT EXISTS] <name> — needed so we can short-circuit
  // index/constraint coverage for indexes declared on a brand-new table.
  const reCreate = requireIdempotent
    ? /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi
    : /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi;
  let crm;
  while ((crm = reCreate.exec(cleaned)) !== null) newTableCoverage.add(crm[1]);
}

// Only `ensure-*.ts` files count toward coverage. Two reasons:
//   1. Production deploys do not run `drizzle-kit migrate` / push, so a
//      CREATE INDEX that lives only in `migrations/*.sql` would never
//      reach production. Accepting drizzle SQL as coverage would defeat
//      the entire point of this check.
//   2. One-shot backfills (e.g. `migrate-to-rbac.ts`,
//      `001-candidate-active-to-available.ts`) do NOT run on every boot,
//      so a CREATE INDEX inside them does not protect production from a
//      missing index either. Restricting to `ensure-*.ts` enforces that
//      schema additions land in something that actually runs at startup.
const ensureFiles = fs.existsSync(ensureDir)
  ? fs.readdirSync(ensureDir).filter((f) => /^ensure-.*\.ts$/.test(f))
  : [];

for (const f of ensureFiles) {
  const src = fs.readFileSync(path.join(ensureDir, f), "utf-8");
  scanSqlForCoverage(src, { requireIdempotent: true, source: f });
}

if (nonIdempotentEnsures.length > 0) {
  console.error(
    "Non-idempotent statements found in boot-migrate ensure scripts " +
      "(every CREATE INDEX in ensure-*.ts MUST use IF NOT EXISTS — the " +
      "script re-runs on every boot):\n",
  );
  for (const msg of nonIdempotentEnsures) console.error("  ✗ " + msg);
  console.error("");
  process.exit(1);
}

// ─── 5. Diff and report ────────────────────────────────────────────────────
/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const allowlistHits = [];
/** @type {string[]} */
const staleAllowlistEntries = [];
/** @type {Set<string>} */
const seenAllowedIndexes = new Set();
/** @type {Set<string>} */
const seenAllowedConstraints = new Set();

/** @param {{ table: string }} info */
function tableImplicitlyCovered(info) {
  // A new (non-baseline) table whose CREATE TABLE IF NOT EXISTS has been
  // seen in some ensure-script: every index/constraint declared on it is
  // presumed covered by the same CREATE TABLE statement.
  return !baselineTables.has(info.table) && newTableCoverage.has(info.table);
}

for (const [name, info] of declaredIndexes) {
  if (baselineIndexes.has(name)) continue;
  if (tableImplicitlyCovered(info)) continue;
  const cov = coveredIndexes.get(name);
  if (cov) {
    // Uniqueness mismatch: a `uniqueIndex(...)` schema declaration MUST be
    // covered by `CREATE UNIQUE INDEX ...`. A plain `CREATE INDEX` with the
    // same name installs a non-unique index in production, so the upsert /
    // dedupe path that relied on the uniqueIndex would silently allow
    // duplicates. We refuse to treat this as covered.
    if (info.isUnique && !cov.isUnique) {
      if (allowedIndexes.has(name)) {
        seenAllowedIndexes.add(name);
        allowlistHits.push(`index ${name}`);
        continue;
      }
      errors.push(
        `Index "${name}" on table "${info.table}" is declared as uniqueIndex(...) ` +
          `in shared/schema.ts but the matching ensure-script CREATE statement ` +
          `is NOT marked UNIQUE. A non-unique index of the same name does not ` +
          `enforce uniqueness, so any upsert/dedupe that relies on it will ` +
          `silently insert duplicates in production. Use ` +
          `CREATE UNIQUE INDEX IF NOT EXISTS ${name} ...`,
      );
    }
    continue;
  }
  if (allowedIndexes.has(name)) {
    seenAllowedIndexes.add(name);
    allowlistHits.push(`index ${name}`);
    continue;
  }
  errors.push(
    `Index "${name}" on table "${info.table}" was added to shared/schema.ts ` +
      `but no server/migrations/ensure-*.ts script CREATEs it via ` +
      `CREATE ${info.isUnique ? "UNIQUE " : ""}INDEX IF NOT EXISTS. ` +
      `Production deploys do not run drizzle-kit push, so this index will ` +
      `be missing at runtime${info.isUnique ? " — and any upsert/dedupe that relies on it will silently insert duplicates" : ""}.`,
  );
}

for (const [name, info] of declaredConstraints) {
  if (baselineConstraints.has(name)) continue;
  if (tableImplicitlyCovered(info)) continue;
  if (coveredConstraints.has(name)) continue;
  if (allowedConstraints.has(name)) {
    seenAllowedConstraints.add(name);
    allowlistHits.push(`constraint ${name}`);
    continue;
  }
  errors.push(
    `Constraint "${name}" (${info.kind}) on table "${info.table}" was added ` +
      `to shared/schema.ts but no server/migrations/ensure-*.ts script ADDs ` +
      `it via ALTER TABLE ${info.table} ADD CONSTRAINT ${name} ...`,
  );
}

for (const pk of unnamedCompositePks) {
  if (tableImplicitlyCovered(pk)) continue;
  if (baselineTables.has(pk.table)) {
    errors.push(
      `Unnamed primaryKey({ columns: [...] }) on existing table "${pk.table}" ` +
        `— provide a \`name: "..."\` property and a matching ensure-script ` +
        `ADD CONSTRAINT so the check can verify coverage.`,
    );
  } else {
    errors.push(
      `Unnamed primaryKey({ columns: [...] }) on new table "${pk.table}" ` +
        `without CREATE TABLE IF NOT EXISTS coverage in any ensure-*.ts ` +
        `script.`,
    );
  }
}

// Stale allowlist entries — gaps the allowlist still claims exist but that
// have since been covered (or removed from shared/schema.ts).
for (const name of allowedIndexes) {
  if (seenAllowedIndexes.has(name)) continue;
  const info = declaredIndexes.get(name);
  const cov = coveredIndexes.get(name);
  // A uniqueIndex(...) declaration covered only by a non-UNIQUE
  // CREATE INDEX is still effectively uncovered (uniqueness missing),
  // so the allowlist entry remains needed.
  const fullyCovered =
    cov && (!info || !info.isUnique || cov.isUnique);
  const stillUncovered =
    info &&
    !baselineIndexes.has(name) &&
    !tableImplicitlyCovered(info) &&
    !fullyCovered;
  if (!stillUncovered) staleAllowlistEntries.push(`index ${name}`);
}
for (const name of allowedConstraints) {
  if (seenAllowedConstraints.has(name)) continue;
  const info = declaredConstraints.get(name);
  const stillUncovered =
    info &&
    !baselineConstraints.has(name) &&
    !tableImplicitlyCovered(info) &&
    !coveredConstraints.has(name);
  if (!stillUncovered) staleAllowlistEntries.push(`constraint ${name}`);
}

if (staleAllowlistEntries.length > 0) {
  console.error(
    "Schema index/constraint allowlist contains stale entries " +
      "(gap is no longer present — please remove from " +
      "scripts/schema-index-allowlist.json):\n",
  );
  for (const e of staleAllowlistEntries) console.error("  ✗ " + e);
  console.error("");
  process.exit(1);
}

if (errors.length > 0) {
  console.error("Schema index/constraint coverage check FAILED:\n");
  for (const e of errors) console.error("  ✗ " + e);
  console.error(
    `\n${errors.length} missing index/constraint migration(s).\n\n` +
      `To fix: add the missing statement to a new or existing\n` +
      `server/migrations/ensure-<topic>.ts file using\n` +
      `  CREATE [UNIQUE] INDEX IF NOT EXISTS <name> ON <table> (...)\n` +
      `or\n` +
      `  ALTER TABLE <table> ADD CONSTRAINT <name> ...\n` +
      `then register the ensure-function in server/index.ts (boot-migrate block).\n` +
      `See server/migrations/README.md for the convention.`,
  );
  process.exit(1);
}

console.log(
  `Schema index/constraint coverage OK — ${declaredIndexes.size} index(es), ` +
    `${declaredConstraints.size} named constraint(s) checked against ` +
    `${baselineIndexes.size} baseline index(es), ` +
    `${baselineConstraints.size} baseline constraint(s) and ` +
    `${ensureFiles.length} ensure script(s).`,
);
if (allowlistHits.length > 0) {
  console.log(
    `(${allowlistHits.length} pre-existing gap(s) suppressed via ` +
      `scripts/schema-index-allowlist.json — shrink that list when you can.)`,
  );
}
