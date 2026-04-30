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
 *   3. (Task #238) A new column IS covered by an ensure-script but the
 *      SQL type written there disagrees with the Drizzle helper used in
 *      `shared/schema.ts` (e.g. `boolean("active")` vs `ADD COLUMN ...
 *      TEXT`). The mapping table lives in `scripts/schema-type-map.mjs`.
 *
 * Run locally:  node scripts/check-schema-migrations.mjs
 * Runs in CI on every PR via `.github/workflows/test.yml`.
 *
 * See `server/migrations/README.md` for the boot-migrate convention.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkColumnTypeMatch } from "./schema-type-map.mjs";

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

// 2a. pgEnum variable name -> SQL enum name (Task #238 type check)
//
// Drizzle declares enum types like:
//   export const candidateClassificationEnum = pgEnum("candidate_classification", [...])
// and consumes them in a column as:
//   classification: candidateClassificationEnum("classification")
// The matching ensure script writes:
//   ADD COLUMN ... candidate_classification NOT NULL DEFAULT 'individual'
// so the type check needs to know that the JS variable
// `candidateClassificationEnum` resolves to SQL type
// `candidate_classification`.
/** @type {Map<string, string>} */
const enumMap = new Map();
const enumRegex = /\b(\w+)\s*=\s*pgEnum\(\s*"([^"]+)"/g;
let em;
while ((em = enumRegex.exec(schemaSrc)) !== null) {
  enumMap.set(em[1], em[2]);
}

/**
 * Walk forward from `start` (the first character of a property declaration
 * inside a pgTable columns block) and return the index of the next
 * character that ends the property: a comma at the columns-block depth, or
 * the end of the block. Tracks paren/bracket/brace depth so that the
 * `text("tags").array()` declaration is captured intact instead of stopping
 * at the first `)` that closes `text(...)`. Skips string literals so a
 * comma inside `default("a, b")` does not split the property.
 *
 * @param {string} src the columns-block contents (text between the `{` and
 *   matching `}` of the pgTable's second argument).
 * @param {number} start index in `src` of the first char of the property
 *   (e.g. the `t` in `tags: text(...)`).
 * @returns {number} index of the terminating comma, or src.length.
 */
function findPropertyEnd(src, start) {
  let depth = 0;
  let i = start;
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
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      // The terminating `}` of the columns block belongs to the parent
      // (it's never reached because `columnsBlock` is sliced inside the
      // braces) but a stray closing bracket at depth 0 still ends the
      // current property.
      if (depth === 0) return i;
      depth--;
    } else if (ch === "," && depth === 0) {
      return i;
    }
    i++;
  }
  return src.length;
}

/**
 * @typedef {{ helper: string, isArray: boolean }} SchemaColumnMeta
 */

/** @type {Map<string, Map<string, SchemaColumnMeta>>} */
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

  /** @type {Map<string, SchemaColumnMeta>} */
  const cols = new Map();
  // Property declarations have shape:
  //   <propName>: <typeFn>("<db_col_name>", ...)
  // The function name can be any identifier (text, varchar, integer, boolean,
  // timestamp, decimal, jsonb, or a custom enum like genderEnum). After the
  // match we walk forward to the end of the property to detect chained
  // `.array()` calls, which the type check needs to compare against the
  // ensure-script's `[]` / ARRAY suffix.
  const propRegex =
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*)\(\s*"([a-zA-Z_][a-zA-Z0-9_]*)"/g;
  let pm;
  while ((pm = propRegex.exec(columnsBlock)) !== null) {
    const helper = pm[2];
    const colName = pm[3];
    const propEnd = findPropertyEnd(columnsBlock, pm.index);
    const propBody = columnsBlock.slice(pm.index, propEnd);
    const isArray = /\.array\s*\(/.test(propBody);
    cols.set(colName, { helper, isArray });
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
/** @type {Map<string, { isNewTable: boolean, cols: Map<string, SchemaColumnMeta> }>} */
const newColumnsByTable = new Map();
for (const [tbl, cols] of schemaTables) {
  const baselineCols = baseline.get(tbl);
  if (!baselineCols) {
    newColumnsByTable.set(tbl, { isNewTable: true, cols: new Map(cols) });
    continue;
  }
  /** @type {Map<string, SchemaColumnMeta>} */
  const newCols = new Map();
  for (const [c, meta] of cols) if (!baselineCols.has(c)) newCols.set(c, meta);
  if (newCols.size > 0) {
    newColumnsByTable.set(tbl, { isNewTable: false, cols: newCols });
  }
}

// ─── 4. Scan ensure-*.ts and drizzle .sql files for ADD/CREATE coverage ────
//
// Each ADD COLUMN is captured with the raw SQL type string that follows
// the column name (everything up to NOT NULL / DEFAULT / REFERENCES /
// PRIMARY KEY / UNIQUE / CHECK / COLLATE / GENERATED / next clause). We
// hold onto it so section 5 can compare it to the Drizzle helper recorded
// for that column (Task #238).
/**
 * @typedef {{ sqlType: string, source: string }} ColumnCoverage
 */
/** @type {Map<string, Map<string, ColumnCoverage>>} */
const coverage = new Map();
/** @type {Set<string>} */
const newTableCoverage = new Set();

function recordColumn(tbl, col, sqlType, source) {
  if (!coverage.has(tbl)) coverage.set(tbl, new Map());
  // First write wins — multiple ensure-scripts touching the same column is
  // unusual, but if it happens the earliest-discovered ALTER decides which
  // type the check compares against. Either flagged mismatches force the
  // contributor to align both sites.
  const t = coverage.get(tbl);
  if (!t.has(col)) t.set(col, { sqlType, source });
}

/**
 * Split a string on `delim` characters that sit at outer (paren / bracket)
 * depth zero, ignoring delimiters that appear inside SQL string literals.
 * Used to break an ALTER TABLE body into individual `ADD COLUMN ...`
 * clauses without splitting `DECIMAL(10, 2)` or `DEFAULT 'a, b'`.
 *
 * @param {string} s
 * @param {string} delim single character
 * @returns {string[]}
 */
function splitTopLevel(s, delim) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'" || ch === '"') {
      const q = ch;
      i++;
      while (i < s.length) {
        if (s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === delim && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  parts.push(s.slice(start));
  return parts;
}

/**
 * Pull the SQL type token off the head of an `ADD COLUMN <col> <rest>`
 * clause's `<rest>`. Stops at:
 *   - the first column constraint keyword (NOT NULL, DEFAULT,
 *     REFERENCES, PRIMARY KEY, UNIQUE, CHECK, COLLATE, GENERATED,
 *     ON UPDATE) so multi-word types like `TIMESTAMP WITHOUT TIME ZONE`
 *     survive intact; or
 *   - the first character outside the SQL type alphabet (word chars,
 *     whitespace, parens, brackets, commas). This keeps the parser
 *     robust against trailing JS template-literal punctuation — a SQL
 *     statement embedded in `` sql`...` `` ends with a backtick (and
 *     usually `)`), neither of which is part of any SQL type.
 *
 * @param {string} rest text after the column name in an ADD COLUMN clause
 * @returns {string} the SQL type, trimmed (may be empty if rest had no type)
 */
function extractSqlType(rest) {
  const stop =
    /\s+(?:NOT\s+NULL|NULL\b|DEFAULT\b|REFERENCES\b|PRIMARY\s+KEY|UNIQUE\b|CHECK\b|COLLATE\b|GENERATED\b|ON\s+UPDATE\b)/i;
  const stopMatch = rest.match(stop);
  let s = stopMatch ? rest.slice(0, stopMatch.index) : rest;
  const valid = s.match(/^[\w\s(),\[\]]+/);
  s = valid ? valid[0] : "";
  return s.trim();
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
    // An ALTER TABLE body can hold multiple comma-separated clauses
    // (`ADD COLUMN ... , ADD COLUMN ...`). Split at the top level so we
    // can capture each column's SQL type separately. `splitTopLevel`
    // skips commas inside parens (DECIMAL(10, 2)) and string literals.
    const reAddHead = requireIdempotent
      ? /^\s*ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?\s+([\s\S]*)$/i
      : /^\s*ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?\s+([\s\S]*)$/i;
    for (const clause of splitTopLevel(body, ",")) {
      const cm = clause.match(reAddHead);
      if (!cm) continue;
      const colName = cm[1];
      const sqlType = extractSqlType(cm[2]);
      recordColumn(tbl, colName, sqlType, source);
    }

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
  const covered = coverage.get(tbl) ?? new Map();
  const allowedForTable = allowedColumns.get(tbl) ?? new Set();
  for (const [col, meta] of info.cols) {
    if (covered.has(col)) {
      // Task #238 — type-mismatch guard. Helper looked up via the
      // mapping table in scripts/schema-type-map.mjs; pgEnum columns
      // resolve via `enumMap`. Unknown helpers (custom column types)
      // return `unknown` and are skipped rather than failing loudly.
      const cov = covered.get(col);
      const verdict = checkColumnTypeMatch({
        drizzleHelper: meta.helper,
        schemaIsArray: meta.isArray,
        sqlType: cov.sqlType,
        enums: enumMap,
      });
      if (verdict.ok === false) {
        errors.push(
          `Column type mismatch for "${tbl}.${col}": ${verdict.reason} ` +
            `(ensure-script: ${cov.source}). Update the ensure-script's ` +
            `ADD COLUMN type so it matches the Drizzle helper in shared/schema.ts.`,
        );
      }
      continue;
    }
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
  const covered = coverage.get(tbl) ?? new Map();
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
