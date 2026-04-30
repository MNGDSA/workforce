/**
 * Task #247 — Direct unit tests for the schema/ensure-script default-expression
 * normalizer.
 *
 * Task #242 introduced `normalizeDefault`, `defaultsCompatible`, and
 * `parseColumnConstraints` in `scripts/schema-type-map.mjs`. The end-to-end
 * subprocess fixtures in `check-schema-migrations.test.ts` cover a handful
 * of representative cases, but the normalization rules themselves
 * (sql-template stripping, type-cast suffix stripping, quote stripping,
 * `CURRENT_TIMESTAMP` ↔ `now()` mapping, `'[]'::jsonb` ↔ `[]`) are only
 * exercised indirectly. A future contributor adding a new equivalence
 * rule (e.g. `gen_random_uuid()` ↔ `uuid_generate_v4()`) should be able
 * to drop a row into the table-driven cases below instead of authoring a
 * fresh subprocess fixture.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDefault,
  defaultsCompatible,
  parseColumnConstraints,
} from "../../scripts/schema-type-map.mjs";

// ─── normalizeDefault ─────────────────────────────────────────────────────

interface NormalizeCase {
  name: string;
  input: string | null | undefined;
  expected: string | null;
}

const normalizeCases: NormalizeCase[] = [
  // Empty / absent inputs collapse to null so callers can distinguish
  // "absent" from "present-but-empty".
  { name: "null input -> null", input: null, expected: null },
  { name: "undefined input -> null", input: undefined, expected: null },
  { name: "empty string -> null", input: "", expected: null },
  { name: "whitespace-only string -> null", input: "   ", expected: null },

  // sql`...` template wrapping.
  {
    name: "sql template strips wrapper around now()",
    input: "sql`now()`",
    expected: "now()",
  },
  {
    name: "sql template strips wrapper around boolean",
    input: "sql`false`",
    expected: "false",
  },
  {
    name: "sql template strips wrapper with surrounding whitespace",
    input: "sql`  gen_random_uuid()  `",
    expected: "gen_random_uuid()",
  },
  {
    name: "sql template + cast + quoted literal collapses to []",
    input: "sql`'[]'::jsonb`",
    expected: "[]",
  },
  {
    name: "sql template + cast on numeric collapses to base value",
    input: "sql`0::numeric(10,2)`",
    expected: "0",
  },

  // Type-cast suffixes (with and without parameters).
  {
    name: "trailing ::jsonb stripped from quoted literal",
    input: "'[]'::jsonb",
    expected: "[]",
  },
  {
    name: "trailing ::text stripped from quoted literal",
    input: "'ar'::text",
    expected: "ar",
  },
  {
    name: "trailing ::numeric stripped from numeric literal",
    input: "0::numeric",
    expected: "0",
  },
  {
    name: "trailing ::numeric(10,2) parameter list stripped",
    input: "0.00::numeric(10, 2)",
    expected: "0.00",
  },
  {
    name: "trailing ::varchar(8) parameter list stripped",
    input: "'en'::varchar(8)",
    expected: "en",
  },

  // Quoted literals (single, double, backtick).
  {
    name: "single-quoted literal stripped",
    input: "'ar'",
    expected: "ar",
  },
  {
    name: "double-quoted literal stripped",
    input: '"ar"',
    expected: "ar",
  },
  {
    // The trailing-backtick strip (which exists to peel JS template-literal
    // punctuation that survives the regex capture) runs *before* the
    // paired-quote check, so a paired-backtick literal effectively only
    // loses its trailing backtick. Real schema-side backticks come in via
    // `sql\`...\`` and are handled by the sql-template branch above.
    name: "paired backticks: trailing backtick stripped first",
    input: "`ar`",
    expected: "`ar",
  },
  {
    name: "mismatched quotes are not stripped",
    input: "'ar\"",
    expected: "'ar\"",
  },
  {
    name: "single-quoted literal with whitespace preserved internally",
    input: "'a, b'",
    expected: "a, b",
  },

  // Numeric / boolean literals — passthrough after lowercase.
  { name: "false literal", input: "false", expected: "false" },
  { name: "FALSE literal lowercased", input: "FALSE", expected: "false" },
  { name: "true literal", input: "true", expected: "true" },
  { name: "TRUE literal lowercased", input: "TRUE", expected: "true" },
  { name: "integer literal", input: "0", expected: "0" },
  { name: "negative integer literal", input: "-1", expected: "-1" },
  { name: "decimal literal", input: "0.00", expected: "0.00" },

  // CURRENT_TIMESTAMP ↔ now() ↔ current_timestamp() equivalence.
  {
    name: "CURRENT_TIMESTAMP -> now()",
    input: "CURRENT_TIMESTAMP",
    expected: "now()",
  },
  {
    name: "current_timestamp -> now()",
    input: "current_timestamp",
    expected: "now()",
  },
  {
    name: "current_timestamp() -> now()",
    input: "current_timestamp()",
    expected: "now()",
  },
  {
    name: "bare 'now' identifier -> now()",
    input: "now",
    expected: "now()",
  },
  {
    name: "now() passes through unchanged",
    input: "now()",
    expected: "now()",
  },

  // Trailing JS template-literal punctuation that survives capture.
  {
    name: "trailing backtick stripped",
    input: "now()`",
    expected: "now()",
  },
  {
    name: "trailing semicolon stripped",
    input: "now();",
    expected: "now()",
  },
];

test("normalizeDefault — table-driven equivalence rules", () => {
  for (const { name, input, expected } of normalizeCases) {
    assert.equal(
      normalizeDefault(input),
      expected,
      `normalizeDefault(${JSON.stringify(input)}) — ${name}`,
    );
  }
});

// ─── defaultsCompatible ──────────────────────────────────────────────────

interface CompatCase {
  name: string;
  schema: string | null | undefined;
  sql: string | null | undefined;
  expected: boolean;
}

const compatCases: CompatCase[] = [
  // Equivalent pairs (the schema's `.default(...)` arg vs the
  // ensure-script's `DEFAULT <expr>` clause).
  { name: "both null", schema: null, sql: null, expected: true },
  {
    name: "single vs double-quoted string literal",
    schema: "'ar'",
    sql: '"ar"',
    expected: true,
  },
  {
    name: "now() vs CURRENT_TIMESTAMP",
    schema: "sql`now()`",
    sql: "CURRENT_TIMESTAMP",
    expected: true,
  },
  {
    name: "now() vs current_timestamp()",
    schema: "now()",
    sql: "current_timestamp()",
    expected: true,
  },
  {
    name: "sql`'[]'::jsonb` vs []",
    schema: "sql`'[]'::jsonb`",
    sql: "[]",
    expected: true,
  },
  {
    name: "boolean literal lowercase vs uppercase",
    schema: "false",
    sql: "FALSE",
    expected: true,
  },
  {
    name: "numeric literal with type cast vs without",
    schema: "0",
    sql: "0::numeric",
    expected: true,
  },

  // Incompatible pairs.
  {
    name: "true vs false",
    schema: "true",
    sql: "false",
    expected: false,
  },
  {
    name: "different string literals",
    schema: "'ar'",
    sql: "'en'",
    expected: false,
  },
  {
    name: "now() vs zero",
    schema: "now()",
    sql: "0",
    expected: false,
  },
];

test("defaultsCompatible — equivalent and incompatible pairs", () => {
  for (const { name, schema, sql, expected } of compatCases) {
    assert.equal(
      defaultsCompatible(schema, sql),
      expected,
      `defaultsCompatible(${JSON.stringify(schema)}, ${JSON.stringify(sql)}) — ${name}`,
    );
  }
});

// ─── parseColumnConstraints ──────────────────────────────────────────────
//
// `parseColumnConstraints` walks the tail of an `ADD COLUMN <col> <type>
// <tail>` clause. The fixture-based subprocess tests cover the happy path;
// the cases below lock down the multi-clause tail behaviour so future
// edits cannot regress it.

interface ParseCase {
  name: string;
  input: string;
  expected: { notNull: boolean; defaultExpr: string | null };
}

const parseCases: ParseCase[] = [
  // No tail — both falsy.
  {
    name: "empty tail",
    input: "",
    expected: { notNull: false, defaultExpr: null },
  },
  {
    name: "type-only tail (no NOT NULL / DEFAULT clause keywords)",
    input: " text",
    expected: { notNull: false, defaultExpr: null },
  },

  // NOT NULL alone.
  {
    name: "NOT NULL only",
    input: " NOT NULL",
    expected: { notNull: true, defaultExpr: null },
  },
  {
    name: "explicit NULL leaves notNull false",
    input: " NULL",
    expected: { notNull: false, defaultExpr: null },
  },

  // DEFAULT alone.
  {
    name: "DEFAULT scalar",
    input: " DEFAULT 0",
    expected: { notNull: false, defaultExpr: "0" },
  },
  {
    name: "DEFAULT now()",
    input: " DEFAULT now()",
    expected: { notNull: false, defaultExpr: "now()" },
  },
  {
    name: "DEFAULT '[]'::jsonb",
    input: " DEFAULT '[]'::jsonb",
    expected: { notNull: false, defaultExpr: "'[]'::jsonb" },
  },
  {
    name: "DEFAULT quoted literal containing comma",
    input: " DEFAULT 'a, b'",
    expected: { notNull: false, defaultExpr: "'a, b'" },
  },
  {
    name: "DEFAULT with escaped single-quote inside literal",
    input: " DEFAULT 'a''b'",
    expected: { notNull: false, defaultExpr: "'a''b'" },
  },

  // Multi-clause tails — DEFAULT must stop at the next clause keyword.
  {
    name: "DEFAULT 0 NOT NULL",
    input: " DEFAULT 0 NOT NULL",
    expected: { notNull: true, defaultExpr: "0" },
  },
  {
    name: "NOT NULL DEFAULT 0",
    input: " NOT NULL DEFAULT 0",
    expected: { notNull: true, defaultExpr: "0" },
  },
  {
    name: "NOT NULL DEFAULT 0 REFERENCES other(id)",
    input: " NOT NULL DEFAULT 0 REFERENCES other(id)",
    expected: { notNull: true, defaultExpr: "0" },
  },
  {
    name: "DEFAULT now() NOT NULL REFERENCES other(id)",
    input: " DEFAULT now() NOT NULL REFERENCES other(id)",
    expected: { notNull: true, defaultExpr: "now()" },
  },
  {
    name: "DEFAULT '[]'::jsonb NOT NULL",
    input: " DEFAULT '[]'::jsonb NOT NULL",
    expected: { notNull: true, defaultExpr: "'[]'::jsonb" },
  },
  {
    name: "REFERENCES alone — bail out, no NOT NULL / DEFAULT seen",
    input: " REFERENCES other(id)",
    expected: { notNull: false, defaultExpr: null },
  },
  {
    name: "PRIMARY KEY — bail out",
    input: " PRIMARY KEY",
    expected: { notNull: false, defaultExpr: null },
  },

  // Trailing JS template-literal punctuation that survives the regex
  // capture must not pollute the captured DEFAULT.
  {
    name: "DEFAULT terminated by trailing backtick at depth 0",
    input: " DEFAULT 'ar'`",
    expected: { notNull: false, defaultExpr: "'ar'" },
  },
  {
    name: "DEFAULT terminated by trailing semicolon at depth 0",
    input: " DEFAULT 0;",
    expected: { notNull: false, defaultExpr: "0" },
  },
];

test("parseColumnConstraints — multi-clause ADD COLUMN tails", () => {
  for (const { name, input, expected } of parseCases) {
    assert.deepEqual(
      parseColumnConstraints(input),
      expected,
      `parseColumnConstraints(${JSON.stringify(input)}) — ${name}`,
    );
  }
});
