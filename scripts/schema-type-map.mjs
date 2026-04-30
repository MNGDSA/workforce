/**
 * Task #238 — Drizzle helper -> acceptable Postgres SQL types mapping.
 *
 * Used by `scripts/check-schema-migrations.mjs` to catch column-type
 * mismatches between `shared/schema.ts` and the boot-migrate ensure-script
 * that adds the column.
 *
 * Without this table the coverage check confirms only that *some*
 * `ADD COLUMN <col>` exists in an `ensure-*.ts` file. A boolean schema
 * column paired with `ADD COLUMN ... TEXT` would silently pass and then
 * return strings to the API at runtime — exactly the class of bug the
 * boot-migrate pattern is meant to prevent.
 *
 * Comparison contract
 * -------------------
 * For each new column found in `shared/schema.ts` (i.e. not in the baseline
 * drizzle snapshot), the check parses:
 *
 *   1. The Drizzle helper used in the schema column declaration. Two cases:
 *      - A built-in pg-core helper like `text(...)`, `boolean(...)`,
 *        `timestamp(...)`. The helper name is looked up in
 *        `DRIZZLE_TO_PG_TYPES` to yield a set of acceptable Postgres base
 *        type names.
 *      - A `pgEnum("foo_kind", [...])` variable. The schema parser collects
 *        all pgEnum declarations and treats `fooKindEnum` as accepting only
 *        the literal SQL type `foo_kind`.
 *
 *   2. The `<type>` token following `ADD COLUMN <name>` in the ensure
 *      script. After `normalizeSqlType` strips parameter lists like
 *      `(8)` / `(10, 2)` and lowercases / collapses whitespace, the
 *      remaining base name (and the array marker, see below) is compared
 *      against the allowed set.
 *
 * Arrays
 * ------
 * Drizzle marks an array column with `.array()` (for example
 * `text("tags").array()`). The corresponding ensure script must use either
 * the `[]` suffix (`TEXT[]`) or the SQL keyword `ARRAY` (`TEXT ARRAY`).
 * `splitArraySuffix` separates the array marker from the base type so the
 * check can compare them independently and reject e.g. a `.array()` schema
 * column paired with a non-array `ADD COLUMN ... text` migration.
 */

/**
 * Drizzle pg-core helper name -> set of Postgres SQL base type names that
 * the ensure-script `ADD COLUMN <col> <type>` is allowed to use. Names are
 * stored lowercase; `normalizeSqlType` lowercases the input before lookup.
 *
 * Multi-word entries (`character varying`, `timestamp with time zone`)
 * cover the canonical Postgres spelling for helpers that have a shorter
 * alias the team typically uses.
 */
export const DRIZZLE_TO_PG_TYPES = {
  // String types
  text: ["text"],
  varchar: ["varchar", "character varying"],
  char: ["char", "character", "bpchar"],

  // Integer family
  smallint: ["smallint", "int2"],
  integer: ["integer", "int", "int4"],
  bigint: ["bigint", "int8"],
  serial: ["serial", "serial4"],
  smallserial: ["smallserial", "serial2"],
  bigserial: ["bigserial", "serial8"],

  // Boolean
  boolean: ["boolean", "bool"],

  // Date / time. Drizzle's `timestamp(...)` defaults to
  // `timestamp without time zone`, but teams often reach for `timestamptz`
  // when they want UTC semantics — accept both spellings until/unless the
  // mode argument gets parsed explicitly.
  timestamp: [
    "timestamp",
    "timestamptz",
    "timestamp with time zone",
    "timestamp without time zone",
  ],
  date: ["date"],
  time: [
    "time",
    "timetz",
    "time with time zone",
    "time without time zone",
  ],
  interval: ["interval"],

  // Numeric / floating
  decimal: ["decimal", "numeric"],
  numeric: ["decimal", "numeric"],
  real: ["real", "float4"],
  doublePrecision: ["double precision", "float8"],

  // JSON
  json: ["json"],
  jsonb: ["jsonb"],

  // Misc
  uuid: ["uuid"],
  bytea: ["bytea"],
  inet: ["inet"],
  cidr: ["cidr"],
  macaddr: ["macaddr"],
};

/**
 * Normalize an SQL type string for comparison.
 *   - Lowercase.
 *   - Strip parenthesised parameter lists like `(8)` or `(10, 2)` so
 *     `VARCHAR(8)` collapses to `varchar` and matches the helper's
 *     parameter-free name.
 *   - Collapse internal whitespace so `TIMESTAMP  WITHOUT   TIME  ZONE`
 *     and `timestamp without time zone` compare equal.
 *
 * Array markers (`[]`, `[3]`, trailing `ARRAY`) are intentionally NOT
 * stripped here so callers can detect them via `splitArraySuffix`.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeSqlType(raw) {
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/\s*\([^)]*\)/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Pull a trailing array marker (`[]`, `[3]`, repeated `[][]`, or the
 * keyword `ARRAY`) off a normalized SQL type and return both pieces.
 *
 * @param {string} normalized output of `normalizeSqlType`
 * @returns {{ base: string, isArray: boolean }}
 */
export function splitArraySuffix(normalized) {
  let s = normalized;
  let isArray = false;
  // Trailing []  (Postgres allows [], [3], [][])
  if (/(\[[^\]]*\])+$/.test(s)) {
    isArray = true;
    s = s.replace(/(\s*\[[^\]]*\])+$/, "").trim();
  }
  // Trailing  ARRAY keyword
  if (/\barray$/.test(s)) {
    isArray = true;
    s = s.replace(/\s*\barray$/, "").trim();
  }
  return { base: s, isArray };
}

/**
 * Decide whether the SQL type written in the ensure-script is acceptable
 * for the Drizzle column declaration in `shared/schema.ts`.
 *
 * @param {object} args
 * @param {string} args.drizzleHelper raw helper identifier from the schema
 *   (e.g. `text`, `boolean`, `genderEnum`).
 * @param {boolean} args.schemaIsArray true iff the schema invokes `.array()`
 * @param {string} args.sqlType raw SQL type as captured from
 *   `ADD COLUMN <col> <type>` in the ensure-script.
 * @param {Map<string, string>} args.enums map of pgEnum JS variable name
 *   (e.g. `genderEnum`) to the underlying SQL enum name (e.g. `gender`).
 * @returns {{ ok: true } | { ok: false, reason: string } | { ok: "unknown" }}
 *   `unknown` is returned when the helper isn't in the mapping table and
 *   isn't a known enum — the caller can then skip the type check rather
 *   than fail loudly on an unfamiliar helper (e.g. a custom column type).
 */
export function checkColumnTypeMatch({
  drizzleHelper,
  schemaIsArray,
  sqlType,
  enums,
}) {
  const normalized = normalizeSqlType(sqlType);
  const { base, isArray: sqlIsArray } = splitArraySuffix(normalized);

  // Resolve the allowed set of base SQL types.
  let allowed;
  if (enums.has(drizzleHelper)) {
    allowed = [enums.get(drizzleHelper).toLowerCase()];
  } else {
    const key = drizzleHelper in DRIZZLE_TO_PG_TYPES
      ? drizzleHelper
      : drizzleHelper.toLowerCase() in DRIZZLE_TO_PG_TYPES
        ? drizzleHelper.toLowerCase()
        : null;
    if (key === null) return { ok: "unknown" };
    allowed = DRIZZLE_TO_PG_TYPES[key];
  }

  if (schemaIsArray !== sqlIsArray) {
    return {
      ok: false,
      reason: schemaIsArray
        ? `schema declares .array() but migration type "${sqlType}" is not an array`
        : `schema is scalar but migration type "${sqlType}" is an array`,
    };
  }

  if (!allowed.includes(base)) {
    return {
      ok: false,
      reason: `schema helper "${drizzleHelper}"${schemaIsArray ? ".array()" : ""} expects one of [${allowed.join(", ")}], migration uses "${sqlType}"`,
    };
  }
  return { ok: true };
}
