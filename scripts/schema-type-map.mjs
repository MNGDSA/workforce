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

// ─── Task #242 — NOT NULL / DEFAULT mismatch detection ─────────────────────
//
// Task #238 closed the type-mismatch gap, but a column declared
// `boolean("active").notNull().default(false)` paired with an ensure-script
// that omits `NOT NULL DEFAULT false` would still pass the type check and
// then crash production on the first insert that doesn't supply the column
// (`null value in column "active" violates not-null constraint`).
//
// The two helpers below normalize default expressions so the schema's
// `.default(<js>)` argument can be compared loosely against the ensure
// script's `DEFAULT <sql>` expression. Exact byte parity is not required
// — `false` ↔ `false`, `'ar'` ↔ `"ar"`, and `now()` ↔ `CURRENT_TIMESTAMP`
// all reduce to the same canonical form.

/**
 * Strip noise off a default-expression string and return a canonical
 * lowercase form for loose comparison between the Drizzle schema's
 * `.default(...)` argument and the ensure-script's `DEFAULT <expr>` clause.
 *
 * Equivalences this handles:
 *   - sql`now()`           → now()
 *   - CURRENT_TIMESTAMP    → now()
 *   - "ar"  / 'ar'         → ar       (single-, double-quote stripped)
 *   - false / FALSE        → false
 *   - sql`'[]'::jsonb`     → []       (sql template + cast + quotes stripped)
 *
 * Returns `null` when the input is empty/null/undefined so callers can
 * distinguish "absent" from "present-but-empty".
 *
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeDefault(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Strip Drizzle's `sql` template wrapper: `sql\`<expr>\`` → `<expr>`.
  // The schema-side default for non-trivial expressions is wrapped like
  //   .default(sql`now()`)   .default(sql`gen_random_uuid()`)
  //   .default(sql`'[]'::jsonb`)
  const sqlTemplateMatch = s.match(/^sql\s*`([\s\S]*)`$/);
  if (sqlTemplateMatch) s = sqlTemplateMatch[1].trim();

  // Strip a single trailing JS template-literal backtick that survives
  // when the SQL is captured from inside `sql\`...\`` (the captured body
  // ends just before the `;`, so the backtick lands in the tail).
  s = s.replace(/`+$/, "").trim();

  // Strip a trailing semicolon (rare, but seen if the SQL has one).
  s = s.replace(/;+$/, "").trim();

  // Strip a Postgres type-cast suffix: `'[]'::jsonb`, `0::numeric`,
  // `'ar'::text`, etc. The `\(\d+(,\s*\d+)?\)?` allows for optional
  // type parameters like `numeric(10,2)`.
  s = s.replace(/::\s*[a-z_][\w]*(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?\s*$/i, "").trim();

  // Strip outer matched quotes (single, double, or backtick) once.
  if (s.length >= 2) {
    const f = s[0];
    const l = s[s.length - 1];
    if (
      (f === "'" && l === "'") ||
      (f === '"' && l === '"') ||
      (f === "`" && l === "`")
    ) {
      s = s.slice(1, -1);
    }
  }

  s = s.toLowerCase().trim();

  // Canonicalise the empty-call form: `current_timestamp` and
  // `current_timestamp()` and `now()` all mean the same thing in PG.
  if (s === "current_timestamp" || s === "current_timestamp()") s = "now()";
  if (s === "now") s = "now()";

  return s;
}

/**
 * Compare a schema-side default expression to an ensure-script's DEFAULT
 * clause expression. Returns true when both reduce to the same canonical
 * form via `normalizeDefault`. Callers that care about presence (one
 * side has a default, the other does not) should check that separately
 * before calling this — `defaultsCompatible(null, null)` is `true`.
 *
 * @param {string|null|undefined} schemaDefault raw arg from `.default(...)`
 * @param {string|null|undefined} sqlDefault expression after `DEFAULT`
 * @returns {boolean}
 */
export function defaultsCompatible(schemaDefault, sqlDefault) {
  return normalizeDefault(schemaDefault) === normalizeDefault(sqlDefault);
}

/**
 * Compare nullability and DEFAULT-presence between a Drizzle schema
 * column declaration and the ensure-script's `ADD COLUMN` clause. Returns
 * a verdict the coverage check can surface as a single error message.
 *
 * Mismatch policy:
 *   - `notNull` must match exactly (both true or both false). A schema
 *     marked `.notNull()` paired with an ensure-script that omits NOT NULL
 *     means inserts that don't supply the column will succeed in dev
 *     (where `drizzle-kit push` ran) and crash in prod (where the column
 *     was added by the ensure-script and is still nullable). The reverse
 *     is also flagged so the two source-of-truth files stay in sync.
 *   - DEFAULT presence must match (both present or both absent). When
 *     both sides declare a default, `defaultsCompatible` does loose
 *     comparison so equivalent-but-different spellings (`'ar'` vs `"ar"`,
 *     `now()` vs `CURRENT_TIMESTAMP`) are accepted.
 *
 * @param {object} args
 * @param {boolean} args.schemaNotNull true iff the schema column has `.notNull()`
 * @param {string|null} args.schemaDefault raw arg from `.default(...)`, or null
 * @param {boolean} args.sqlNotNull true iff the ensure-script wrote NOT NULL
 * @param {string|null} args.sqlDefault expression after `DEFAULT` in the ensure-script, or null
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkNullDefaultMatch({
  schemaNotNull,
  schemaDefault,
  sqlNotNull,
  sqlDefault,
}) {
  if (schemaNotNull !== sqlNotNull) {
    return {
      ok: false,
      reason: schemaNotNull
        ? `schema declares .notNull() but migration omits NOT NULL`
        : `schema is nullable but migration declares NOT NULL`,
    };
  }
  const schemaHas =
    schemaDefault !== null &&
    schemaDefault !== undefined &&
    String(schemaDefault).trim() !== "";
  const sqlHas =
    sqlDefault !== null &&
    sqlDefault !== undefined &&
    String(sqlDefault).trim() !== "";
  if (schemaHas !== sqlHas) {
    return {
      ok: false,
      reason: schemaHas
        ? `schema declares .default(${String(schemaDefault).trim()}) but migration omits DEFAULT`
        : `schema has no default but migration declares DEFAULT ${String(sqlDefault).trim()}`,
    };
  }
  if (schemaHas && sqlHas && !defaultsCompatible(schemaDefault, sqlDefault)) {
    return {
      ok: false,
      reason: `schema default ${String(schemaDefault).trim()} is incompatible with migration DEFAULT ${String(sqlDefault).trim()}`,
    };
  }
  return { ok: true };
}

/**
 * Task #242 — parse the post-type tail of an `ADD COLUMN <col> <type> ...`
 * clause for `NOT NULL` and `DEFAULT <expr>`. The DEFAULT expression is
 * captured with paren / single-quote awareness so:
 *   - `DEFAULT 'a, b'`              → `'a, b'`
 *   - `DEFAULT now()`               → `now()`
 *   - `DEFAULT '[]'::jsonb`         → `'[]'::jsonb`
 *   - `DEFAULT 0 NOT NULL`          → `0`        (stops at next clause)
 * A backtick or semicolon at depth 0 also terminates the expression so
 * the trailing JS template-literal punctuation that survives in the
 * regex-captured ALTER body (`...DEFAULT 'ar'\`)`) does not pollute the
 * captured value.
 *
 * Other clauses (REFERENCES, PRIMARY KEY, etc.) end the parse — the
 * coverage check only cares about NOT NULL and DEFAULT.
 *
 * @param {string} rest text after the column name in an ADD COLUMN clause
 * @returns {{ notNull: boolean, defaultExpr: string|null }}
 */
export function parseColumnConstraints(rest) {
  const stop =
    /\s+(?:NOT\s+NULL|NULL\b|DEFAULT\b|REFERENCES\b|PRIMARY\s+KEY|UNIQUE\b|CHECK\b|COLLATE\b|GENERATED\b|ON\s+UPDATE\b)/i;
  const stopMatch = rest.match(stop);
  if (!stopMatch) return { notNull: false, defaultExpr: null };
  const tail = rest.slice(stopMatch.index);
  let i = 0;
  let notNull = false;
  /** @type {string|null} */
  let defaultExpr = null;

  while (i < tail.length) {
    while (i < tail.length && /\s/.test(tail[i])) i++;
    if (i >= tail.length) break;
    const sub = tail.slice(i);

    let mm;
    if ((mm = sub.match(/^NOT\s+NULL\b/i))) {
      notNull = true;
      i += mm[0].length;
      continue;
    }
    if ((mm = sub.match(/^NULL\b/i))) {
      // explicit nullable — leave notNull = false
      i += mm[0].length;
      continue;
    }
    if ((mm = sub.match(/^DEFAULT\b/i))) {
      i += mm[0].length;
      while (i < tail.length && /\s/.test(tail[i])) i++;
      const exprStart = i;
      let depth = 0;
      while (i < tail.length) {
        const ch = tail[i];
        // SQL string literal — single quote only. Postgres escapes a
        // single quote by doubling it (`''`).
        if (ch === "'") {
          i++;
          while (i < tail.length) {
            if (tail[i] === "'" && tail[i + 1] === "'") {
              i += 2;
              continue;
            }
            if (tail[i] === "'") {
              i++;
              break;
            }
            i++;
          }
          continue;
        }
        if (ch === "(" || ch === "[") {
          depth++;
          i++;
          continue;
        }
        if (ch === ")" || ch === "]") {
          if (depth === 0) break;
          depth--;
          i++;
          continue;
        }
        // Backtick / semicolon at depth 0 ends the expression — these
        // are JS template-literal punctuation that survives in the
        // regex-captured ALTER body, never legitimate SQL default chars.
        if (depth === 0 && (ch === "`" || ch === ";")) break;
        if (depth === 0) {
          // Stop at the next clause keyword preceded by whitespace.
          const ahead = tail.slice(i);
          if (
            /^\s+(?:NOT\s+NULL|NULL\b|REFERENCES\b|PRIMARY\s+KEY|UNIQUE\b|CHECK\b|COLLATE\b|GENERATED\b|ON\s+UPDATE\b)/i.test(
              ahead,
            )
          ) {
            break;
          }
        }
        i++;
      }
      const captured = tail.slice(exprStart, i).trim();
      defaultExpr = captured.length > 0 ? captured : null;
      continue;
    }

    // Unknown clause (REFERENCES, PRIMARY KEY, etc.) — bail out. The
    // null/default check doesn't care about anything past this point and
    // walking arbitrary SQL grammar from here is fragile.
    break;
  }

  return { notNull, defaultExpr };
}
