#!/usr/bin/env node
// Task #182 — Backfill empty-string `region` values to NULL across the
// three tables that share the field: job_postings, smp_companies, and
// events. The job-posting create/edit form historically allowed
// `region: ""` to slip through, and several display sites use
// `job.region ?? job.location` which treats the empty string as a
// present value (hiding the location fallback). The write-boundary
// normalization in server/routes.ts prevents new bad rows; this
// one-shot cleans up legacy rows.
//
// Whitespace-only values are also treated as blank, matching the
// server-side `normalizeBlankRegion` helper.
//
// Usage:
//   node scripts/backfill-empty-regions.mjs            # dry-run (no writes)
//   node scripts/backfill-empty-regions.mjs --apply    # apply updates
//
// Connects via PROD_DATABASE_URL by default, or DATABASE_URL if PROD is unset.
// SSL handling matches scripts/backfill-iban-bank-codes.mjs
// (sslmode=no-verify, rejectUnauthorized:false) so it works against
// managed Postgres providers without a CA bundle on disk.

import pg from "pg";

const APPLY = process.argv.includes("--apply");
const DB_URL = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: PROD_DATABASE_URL or DATABASE_URL must be set.");
  process.exit(1);
}

const url = DB_URL.replace("sslmode=require", "sslmode=no-verify");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

// Each entry: { table, columns: [...] }. Task #182 covered the region
// column on jobs/smp/events; Task #183 extends the same cleanup to the
// candidate dropdown columns that also leaked empty-string values.
const TABLE_FIELDS = [
  { table: "job_postings", columns: ["region"] },
  { table: "smp_companies", columns: ["region"] },
  { table: "events", columns: ["region"] },
  {
    table: "candidates",
    columns: [
      "city",
      "region",
      "marital_status",
      "education_level",
      "date_of_birth",
      "current_role",
      "current_employer",
      "university",
      "major",
      "nationality_text",
    ],
  },
];

let totalAffected = 0;
try {
  for (const { table, columns } of TABLE_FIELDS) {
    for (const col of columns) {
      const { rows } = await client.query(
        `SELECT id, ${col} FROM ${table}
         WHERE ${col} IS NOT NULL AND btrim(${col}) = ''`
      );
      console.log(`[${table}.${col}] blank rows: ${rows.length}`);
      if (rows.length > 0) {
        for (const r of rows.slice(0, 5)) {
          console.log(`  - id=${r.id} ${col}=${JSON.stringify(r[col])}`);
        }
        if (rows.length > 5) console.log(`  ... (${rows.length - 5} more)`);
      }
      totalAffected += rows.length;

      if (APPLY && rows.length > 0) {
        const res = await client.query(
          `UPDATE ${table} SET ${col} = NULL
           WHERE ${col} IS NOT NULL AND btrim(${col}) = ''`
        );
        console.log(`[${table}.${col}] updated ${res.rowCount} row(s).`);
      }
    }
  }

  const totalCols = TABLE_FIELDS.reduce((s, t) => s + t.columns.length, 0);
  console.log("");
  console.log(APPLY
    ? `Done. Cleaned ${totalAffected} row(s) across ${totalCols} column(s).`
    : `Dry-run complete. ${totalAffected} row(s) would be updated across ${totalCols} column(s). Re-run with --apply to write.`);
} finally {
  await client.end();
}
