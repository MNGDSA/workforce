#!/usr/bin/env node
// Task #183 — Generic backfill of empty-string ("" / whitespace-only)
// values to NULL across optional text/varchar columns. Companion to the
// `normalizeBlankFields` write-boundary helper in server/routes.ts.
//
// The original symptom (task #182) was display sites using
// `x ?? fallback` which treats `""` as a present value and hides the
// fallback. Beyond that, several Zod-derived insert schemas reject `""`
// for nullable enum-like text columns (gender, nationality,
// maritalStatus, region, …) where the form sends `""` for an
// unselected dropdown.
//
// Whitespace-only values are treated as blank, matching the server-side
// helper.
//
// Usage:
//   # Default: dry-run the fixed list of (table, field) pairs below.
//   node scripts/backfill-empty-fields.mjs
//
//   # Apply the fixed list.
//   node scripts/backfill-empty-fields.mjs --apply
//
//   # Target one or more specific (table, field) pairs.
//   node scripts/backfill-empty-fields.mjs --table job_postings --field department
//   node scripts/backfill-empty-fields.mjs --table candidates --field gender,nationality,marital_status --apply
//   node scripts/backfill-empty-fields.mjs --table workforce --field termination_reason --table workforce --field termination_category
//
// Connects via PROD_DATABASE_URL by default, or DATABASE_URL if PROD is
// unset. SSL handling matches the other backfill scripts
// (sslmode=no-verify, rejectUnauthorized:false) so it works against
// managed Postgres providers without a CA bundle on disk.

import pg from "pg";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

// Parse repeated --table / --field flags into pairs. A single --table can
// be paired with a comma-separated --field list, or each --table can have
// its own --field. Order matters: each --table consumes the next --field.
//
// Strict pairing: any --table without a matching --field, or vice
// versa, is an error. We refuse to silently fall back to the default
// fixed list when partial flags are supplied — that would let a typo
// like `--table candidates` (no --field) blow past the operator's
// intent and rewrite a much larger surface than they expected.
function parseTargets(argv) {
  const pairs = [];
  let pendingTable = null;
  let sawAny = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--table") {
      sawAny = true;
      if (pendingTable !== null) {
        throw new Error(`--table "${pendingTable}" has no matching --field`);
      }
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        throw new Error("--table flag requires a value");
      }
      pendingTable = value;
    } else if (a === "--field") {
      sawAny = true;
      if (pendingTable === null) {
        throw new Error("--field provided before any --table");
      }
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        throw new Error("--field flag requires a value");
      }
      const fields = value.split(",").map(s => s.trim()).filter(Boolean);
      if (fields.length === 0) {
        throw new Error("--field value resolved to an empty list");
      }
      for (const f of fields) pairs.push({ table: pendingTable, field: f });
      pendingTable = null;
    }
  }
  if (pendingTable !== null) {
    throw new Error(`--table "${pendingTable}" has no matching --field`);
  }
  if (sawAny && pairs.length === 0) {
    throw new Error("--table / --field flags supplied but no (table, field) pairs were parsed");
  }
  return pairs;
}

// Default fixed list — matches the per-model `*_BLANK_FIELDS` constants
// in server/routes.ts (camelCase form keys mapped to snake_case columns
// here). Region was already cleaned by the task #182 backfill but is
// kept idempotent.
const DEFAULT_TARGETS = [
  // events
  { table: "events", field: "region" },
  { table: "events", field: "description" },
  { table: "events", field: "end_date" },
  // job_postings
  { table: "job_postings", field: "region" },
  { table: "job_postings", field: "location" },
  { table: "job_postings", field: "department" },
  { table: "job_postings", field: "deadline" },
  { table: "job_postings", field: "description" },
  { table: "job_postings", field: "requirements" },
  // smp_companies
  { table: "smp_companies", field: "region" },
  { table: "smp_companies", field: "cr_number" },
  { table: "smp_companies", field: "contact_person" },
  { table: "smp_companies", field: "contact_phone" },
  { table: "smp_companies", field: "contact_email" },
  { table: "smp_companies", field: "bank_name" },
  { table: "smp_companies", field: "bank_iban" },
  { table: "smp_companies", field: "notes" },
  // workforce
  { table: "workforce", field: "end_date" },
  { table: "workforce", field: "termination_reason" },
  { table: "workforce", field: "termination_category" },
  { table: "workforce", field: "notes" },
  { table: "workforce", field: "offboarding_status" },
  { table: "workforce", field: "settlement_paid_by" },
  { table: "workforce", field: "settlement_reference" },
  { table: "workforce", field: "payment_method_reason" },
  // applications
  { table: "applications", field: "notes" },
  // candidates
  { table: "candidates", field: "candidate_code" },
  { table: "candidates", field: "gender" },
  { table: "candidates", field: "date_of_birth" },
  { table: "candidates", field: "nationality" },
  { table: "candidates", field: "email" },
  { table: "candidates", field: "phone" },
  { table: "candidates", field: "whatsapp" },
  { table: "candidates", field: "city" },
  { table: "candidates", field: "region" },
  { table: "candidates", field: "national_id" },
  { table: "candidates", field: "iqama_number" },
  { table: "candidates", field: "passport_number" },
  { table: "candidates", field: "current_role" },
  { table: "candidates", field: "current_employer" },
  { table: "candidates", field: "education_level" },
  { table: "candidates", field: "university" },
  { table: "candidates", field: "major" },
  { table: "candidates", field: "nationality_text" },
  { table: "candidates", field: "marital_status" },
  { table: "candidates", field: "chronic_diseases" },
  { table: "candidates", field: "emergency_contact_name" },
  { table: "candidates", field: "emergency_contact_phone" },
  { table: "candidates", field: "notes" },
];

const DB_URL = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: PROD_DATABASE_URL or DATABASE_URL must be set.");
  process.exit(1);
}

let targets;
try {
  const parsed = parseTargets(args);
  targets = parsed.length > 0 ? parsed : DEFAULT_TARGETS;
} catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
}

// Identifier whitelist — only allow plain snake_case identifiers in
// dynamic SQL, since pg's parameter substitution doesn't apply to
// identifiers. Keeps us safe even with operator-supplied --table /
// --field arguments.
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;
for (const t of targets) {
  if (!SAFE_IDENT.test(t.table) || !SAFE_IDENT.test(t.field)) {
    console.error(`ERROR: refusing unsafe identifier "${t.table}.${t.field}" — only [a-z_][a-z0-9_]* is allowed.`);
    process.exit(1);
  }
}

const url = DB_URL.replace("sslmode=require", "sslmode=no-verify");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

let totalAffected = 0;
let totalUpdated = 0;
let skipped = 0;
try {
  for (const { table, field } of targets) {
    // Skip targets where the column doesn't exist on this DB. Lets the
    // default list stay forward-compatible if a column is renamed.
    const colCheck = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = $1 AND column_name = $2`,
      [table, field],
    );
    if (colCheck.rowCount === 0) {
      console.log(`[${table}.${field}] column not found — skipping.`);
      skipped++;
      continue;
    }

    const { rows } = await client.query(
      `SELECT id, "${field}" AS value FROM "${table}"
       WHERE "${field}" IS NOT NULL AND btrim("${field}"::text) = ''`,
    );
    console.log(`[${table}.${field}] blank rows: ${rows.length}`);
    if (rows.length > 0) {
      for (const r of rows.slice(0, 5)) {
        console.log(`  - id=${r.id} value=${JSON.stringify(r.value)}`);
      }
      if (rows.length > 5) console.log(`  ... (${rows.length - 5} more)`);
    }
    totalAffected += rows.length;

    if (APPLY && rows.length > 0) {
      const res = await client.query(
        `UPDATE "${table}" SET "${field}" = NULL
         WHERE "${field}" IS NOT NULL AND btrim("${field}"::text) = ''`,
      );
      console.log(`[${table}.${field}] updated ${res.rowCount} row(s).`);
      totalUpdated += res.rowCount ?? 0;
    }
  }

  console.log("");
  console.log(
    APPLY
      ? `Done. Cleaned ${totalUpdated} row(s) across ${targets.length - skipped} (table, field) pair(s) (${skipped} skipped).`
      : `Dry-run complete. ${totalAffected} row(s) would be updated across ${targets.length - skipped} (table, field) pair(s) (${skipped} skipped). Re-run with --apply to write.`
  );
} finally {
  await client.end();
}
