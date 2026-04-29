#!/usr/bin/env node
/**
 * Task #234 — Schema migration coverage check.
 *
 * The team uses boot-migrate self-heal scripts (`server/migrations/ensure-*.ts`)
 * instead of true sequential SQL migrations. Production deploys do not run
 * `drizzle-kit push`, so any column added to `shared/schema.ts` without a
 * matching `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ensure-script will
 * crash production with `column "..." does not exist` (Tasks #214, #233 and
 * the original `users.locale` incident were all this same root cause).
 *
 * This check fails the build when:
 *   1. A column appears in `shared/schema.ts` that is not in the baseline
 *      drizzle snapshot (`migrations/meta/0000_snapshot.json`) AND no
 *      `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col>` exists in any
 *      `server/migrations/ensure-*.ts` file or in `migrations/*.sql`.
 *   2. A new table appears in `shared/schema.ts` that is not in the baseline
 *      and no `CREATE TABLE IF NOT EXISTS` covers it.
 *
 * Run locally:  node scripts/check-schema-migrations.mjs
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
// (see server/__tests__/check-schema-migrations.test.ts). When unset, the
// real project paths are used.
const schemaPath =
  process.env.CHECK_SCHEMA_PATH ?? path.join(projectRoot, "shared", "schema.ts");
const snapshotPath =
  process.env.CHECK_SNAPSHOT_PATH ??
  path.join(projectRoot, "migrations", "meta", "0000_snapshot.json");
const ensureDir =
  process.env.CHECK_ENSURE_DIR ?? path.join(projectRoot, "server", "migrations");
const drizzleSqlDir =
  process.env.CHECK_DRIZZLE_SQL_DIR ?? path.join(projectRoot, "migrations");
const allowlistPath =
  process.env.CHECK_ALLOWLIST_PATH ??
  path.join(projectRoot, "scripts", "schema-migration-allowlist.json");

// ─── 0. Load allowlist of pre-existing gaps ────────────────────────────────
// Pre-existing schema drift that predates this check (Task #234). Each entry
// is a column or table that was added to shared/schema.ts without an
// ensure-script but is presumed to exist in production already (via
// drizzle-kit push, ensure-critical-tables recovery, or a one-shot script).
// New schema additions MUST add an ensure-script instead of growing this
// allowlist — that's the whole point of the check.
let allowlist = { newColumns: {}, newTables: [] };
if (fs.existsSync(allowlistPath)) {
  const raw = JSON.parse(fs.readFileSync(allowlistPath, "utf-8"));
  allowlist = {
    newColumns: raw.newColumns ?? {},
    newTables: raw.newTables ?? [],
  };
}
const allowedTables = new Set(allowlist.newTables);
/** @type {Map<string, Set<string>>} */
const allowedColumns = new Map();
for (const [tbl, cols] of Object.entries(allowlist.newColumns)) {
  allowedColumns.set(tbl, new Set(cols));
}

// ─── 1. Baseline column map from drizzle snapshot ──────────────────────────
if (!fs.existsSync(snapshotPath)) {
  console.error(
    `Baseline snapshot missing: ${path.relative(projectRoot, snapshotPath)}`,
  );
  process.exit(2);
}
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
/** @type {Map<string, Set<string>>} */
const baseline = new Map();
for (const tableEntry of Object.values(snapshot.tables ?? {})) {
  baseline.set(
    tableEntry.name,
    new Set(Object.keys(tableEntry.columns ?? {})),
  );
}

// ─── 2. Parse shared/schema.ts for table -> columns ────────────────────────
const schemaSrc = fs.readFileSync(schemaPath, "utf-8");

/**
 * Walk forward from a `{` and return the index of the matching `}`. Skips
 * string literals (single, double, backtick) and line/block comments so that
 * braces inside them do not perturb the depth counter.
 *
 * @param {string} src
 * @param {number} openIdx index of the opening `{`
 * @returns {number} index of the matching `}`, or -1 if unbalanced
 */
function findMatchingBrace(src, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
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
      const quote = ch;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** @type {Map<string, Set<string>>} */
const schemaTables = new Map();
const tableRegex = /pgTable\(\s*"([^"]+)"\s*,\s*\{/g;
let m;
while ((m = tableRegex.exec(schemaSrc)) !== null) {
  const tableName = m[1];
  const openBrace = tableRegex.lastIndex - 1;
  const closeBrace = findMatchingBrace(schemaSrc, openBrace);
  if (closeBrace === -1) {
    console.error(
      `Could not parse columns block for table "${tableName}" in shared/schema.ts`,
    );
    process.exit(2);
  }
  const columnsBlock = schemaSrc.slice(openBrace + 1, closeBrace);

  const cols = new Set();
  // Property declarations have shape:
  //   <propName>: <typeFn>("<db_col_name>", ...)
  // The function name can be any identifier (text, varchar, integer, boolean,
  // timestamp, decimal, jsonb, or a custom enum like genderEnum).
  const propRegex =
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\(\s*"([a-zA-Z_][a-zA-Z0-9_]*)"/g;
  let pm;
  while ((pm = propRegex.exec(columnsBlock)) !== null) {
    cols.add(pm[3]);
  }
  schemaTables.set(tableName, cols);
  // Continue scanning from after the table block for the next pgTable(...)
  tableRegex.lastIndex = closeBrace + 1;
}

if (schemaTables.size === 0) {
  console.error(
    "Parsed 0 tables from shared/schema.ts — the parser regex is likely out of date.",
  );
  process.exit(2);
}

// ─── 3. Compute new columns / tables since baseline ────────────────────────
/** @type {Map<string, { isNewTable: boolean, cols: Set<string> }>} */
const newColumnsByTable = new Map();
for (const [tbl, cols] of schemaTables) {
  const baselineCols = baseline.get(tbl);
  if (!baselineCols) {
    newColumnsByTable.set(tbl, { isNewTable: true, cols: new Set(cols) });
    continue;
  }
  const newCols = new Set();
  for (const c of cols) if (!baselineCols.has(c)) newCols.add(c);
  if (newCols.size > 0) {
    newColumnsByTable.set(tbl, { isNewTable: false, cols: newCols });
  }
}

// ─── 4. Scan ensure-*.ts and drizzle .sql files for ADD/CREATE coverage ────
/** @type {Map<string, Set<string>>} */
const coverage = new Map();
/** @type {Set<string>} */
const newTableCoverage = new Set();

function recordColumn(tbl, col) {
  if (!coverage.has(tbl)) coverage.set(tbl, new Set());
  coverage.get(tbl).add(col);
}

/** @type {string[]} */
const nonIdempotentEnsures = [];

/**
 * Scan a chunk of source for `ADD COLUMN` / `CREATE TABLE` coverage.
 *
 * @param {string} sql raw source containing SQL (template literals, sql.raw,
 *   plain .sql file, etc.)
 * @param {{ requireIdempotent: boolean, source: string }} opts
 *   When `requireIdempotent` is true (boot-migrate ensure-*.ts files), only
 *   `ADD COLUMN IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` are counted
 *   as coverage — non-idempotent ALTERs would crash on the second boot, so
 *   the contract requires the IF NOT EXISTS clause. For sequential SQL
 *   migrations (drizzle .sql files), idempotency is not required because
 *   each file runs at most once.
 */
function scanSqlForCoverage(sql, opts) {
  const { requireIdempotent, source } = opts;
  // Strip SQL line comments to avoid false positives in commented-out code.
  const cleaned = sql.replace(/--[^\n]*/g, "");

  // ALTER TABLE [IF EXISTS] <name> <body up to ';'>
  const reAlter =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?\s+([\s\S]*?);/gi;
  let am;
  while ((am = reAlter.exec(cleaned)) !== null) {
    const tbl = am[1];
    const body = am[2];
    const reAdd = requireIdempotent
      ? /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi
      : /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi;
    let cm;
    while ((cm = reAdd.exec(body)) !== null) recordColumn(tbl, cm[1]);

    if (requireIdempotent) {
      // Surface non-idempotent ALTER ... ADD COLUMN inside ensure scripts
      // so the contributor sees a clear error instead of a silent miss.
      const reBareAdd =
        /ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi;
      let bm;
      while ((bm = reBareAdd.exec(body)) !== null) {
        nonIdempotentEnsures.push(
          `${source}: ALTER TABLE ${tbl} ADD COLUMN ${bm[1]} (missing IF NOT EXISTS)`,
        );
      }
    }
  }

  // CREATE TABLE [IF NOT EXISTS] <name>
  const reCreate = requireIdempotent
    ? /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi
    : /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi;
  let crm;
  while ((crm = reCreate.exec(cleaned)) !== null) newTableCoverage.add(crm[1]);

  if (requireIdempotent) {
    const reBareCreate =
      /CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi;
    let bcm;
    while ((bcm = reBareCreate.exec(cleaned)) !== null) {
      nonIdempotentEnsures.push(
        `${source}: CREATE TABLE ${bcm[1]} (missing IF NOT EXISTS)`,
      );
    }
  }
}

// Only files that match the boot-migrate naming convention count toward
// coverage. One-shot or backfill scripts (e.g. `migrate-to-rbac.ts`,
// `001-candidate-active-to-available.ts`) do NOT run on every boot, so an
// `ALTER TABLE` inside them does not protect production from a missing
// column. Restricting to `ensure-*.ts` enforces that schema additions land
// in something that runs at startup.
const ensureFiles = fs
  .readdirSync(ensureDir)
  .filter((f) => /^ensure-.*\.ts$/.test(f));

for (const f of ensureFiles) {
  const src = fs.readFileSync(path.join(ensureDir, f), "utf-8");
  // Pass the whole source to the scanner — it walks `ALTER TABLE` / `CREATE
  // TABLE` sequences regardless of whether they sit inside a sql`...`
  // template literal, a plain backtick/quoted string, or sql.raw(`...`).
  // Comments are stripped inside the scanner.
  scanSqlForCoverage(src, { requireIdempotent: true, source: f });
}

if (fs.existsSync(drizzleSqlDir)) {
  const sqlFiles = fs
    .readdirSync(drizzleSqlDir)
    .filter((f) => f.endsWith(".sql") && f !== "0000_initial.sql");
  for (const f of sqlFiles) {
    const src = fs.readFileSync(path.join(drizzleSqlDir, f), "utf-8");
    // Sequential SQL migrations are not required to be idempotent — each
    // file runs at most once via drizzle-kit's journal.
    scanSqlForCoverage(src, { requireIdempotent: false, source: f });
  }
}

// Surface non-idempotent ensure-script statements early — they are real
// boot-time bugs even if coverage looks complete elsewhere.
if (nonIdempotentEnsures.length > 0) {
  console.error(
    "Non-idempotent statements found in boot-migrate ensure scripts " +
      "(every ALTER/CREATE in ensure-*.ts MUST use IF NOT EXISTS — the " +
      "script re-runs on every boot):\n",
  );
  for (const m of nonIdempotentEnsures) console.error("  ✗ " + m);
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

// Track which allowlist entries we actually used so we can flag stale ones
// (entries that no longer correspond to a real gap, because either the
// snapshot caught up or someone added a real ensure-script).
const seenAllowedTables = new Set();
/** @type {Map<string, Set<string>>} */
const seenAllowedColumns = new Map();

for (const [tbl, info] of newColumnsByTable) {
  if (info.isNewTable) {
    if (newTableCoverage.has(tbl)) continue;
    if (allowedTables.has(tbl)) {
      seenAllowedTables.add(tbl);
      allowlistHits.push(`table ${tbl}`);
      continue;
    }
    errors.push(
      `Table "${tbl}" is defined in shared/schema.ts but is not in the baseline ` +
        `migration (migrations/0000_initial.sql) and no boot-migrate ensure script ` +
        `creates it via CREATE TABLE IF NOT EXISTS.`,
    );
    continue;
  }
  const covered = coverage.get(tbl) ?? new Set();
  const allowedForTable = allowedColumns.get(tbl) ?? new Set();
  for (const col of info.cols) {
    if (covered.has(col)) continue;
    if (allowedForTable.has(col)) {
      if (!seenAllowedColumns.has(tbl)) seenAllowedColumns.set(tbl, new Set());
      seenAllowedColumns.get(tbl).add(col);
      allowlistHits.push(`${tbl}.${col}`);
      continue;
    }
    errors.push(
      `Column "${tbl}.${col}" was added to shared/schema.ts but no ` +
        `server/migrations/ensure-*.ts script ALTERs the table to add it. ` +
        `Production deploys do not run drizzle-kit push, so this column ` +
        `will be missing at runtime.`,
    );
  }
}

// Detect stale allowlist entries: gaps that the allowlist still claims exist
// but that have since been covered (or the column was removed from
// shared/schema.ts entirely). Stale entries silently weaken the check, so
// we fail loudly to force the contributor to prune them.
for (const tbl of allowedTables) {
  if (seenAllowedTables.has(tbl)) continue;
  // If the table has since been added to baseline OR is covered by an
  // ensure CREATE TABLE, the allowlist entry is no longer needed.
  const stillUncoveredNewTable =
    newColumnsByTable.get(tbl)?.isNewTable === true &&
    !newTableCoverage.has(tbl);
  if (!stillUncoveredNewTable) {
    staleAllowlistEntries.push(`table ${tbl}`);
  }
}
for (const [tbl, cols] of allowedColumns) {
  const seen = seenAllowedColumns.get(tbl) ?? new Set();
  const newInfo = newColumnsByTable.get(tbl);
  const covered = coverage.get(tbl) ?? new Set();
  for (const col of cols) {
    if (seen.has(col)) continue;
    const stillUncovered =
      newInfo &&
      !newInfo.isNewTable &&
      newInfo.cols.has(col) &&
      !covered.has(col);
    if (!stillUncovered) staleAllowlistEntries.push(`${tbl}.${col}`);
  }
}

if (staleAllowlistEntries.length > 0) {
  console.error(
    "Schema migration allowlist contains stale entries " +
      "(gap is no longer present — please remove from " +
      "scripts/schema-migration-allowlist.json):\n",
  );
  for (const e of staleAllowlistEntries) console.error("  ✗ " + e);
  console.error("");
  process.exit(1);
}

if (errors.length > 0) {
  console.error("Schema migration coverage check FAILED:\n");
  for (const e of errors) console.error("  ✗ " + e);
  console.error(
    `\n${errors.length} missing migration(s).\n\n` +
      `To fix: add the missing column(s) to a new or existing\n` +
      `server/migrations/ensure-<topic>.ts file using\n` +
      `  ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <column> <type> ...\n` +
      `then register the ensure-function in server/index.ts (boot-migrate block).\n` +
      `See server/migrations/README.md for the convention.`,
  );
  process.exit(1);
}

const totalCols = [...schemaTables.values()].reduce((n, s) => n + s.size, 0);
console.log(
  `Schema migration coverage OK — ${schemaTables.size} table(s), ` +
    `${totalCols} column(s) checked against ` +
    `${baseline.size} baseline table(s) and ${ensureFiles.length} ensure script(s).`,
);
if (allowlistHits.length > 0) {
  console.log(
    `(${allowlistHits.length} pre-existing gap(s) suppressed via ` +
      `scripts/schema-migration-allowlist.json — shrink that list when you can.)`,
  );
}
