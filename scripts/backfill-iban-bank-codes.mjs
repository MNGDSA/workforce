#!/usr/bin/env node
// Backfill ibanBankName / ibanBankCode for candidates that have a valid SA IBAN
// but a NULL bank code, using the lookup table in client/src/lib/saudi-banks.ts.
//
// Usage:
//   node .local/scripts/backfill-iban-bank-codes.mjs            # dry-run (no writes)
//   node .local/scripts/backfill-iban-bank-codes.mjs --apply    # apply updates
//
// Connects via PROD_DATABASE_URL by default, or DATABASE_URL if PROD is unset.
// SSL handling matches .local/prod-tools/audit.cjs (sslmode=no-verify, rejectUnauthorized:false).

import pg from "pg";
import { readFile } from "node:fs/promises";

const APPLY = process.argv.includes("--apply");
const DB_URL = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: PROD_DATABASE_URL or DATABASE_URL must be set.");
  process.exit(1);
}

// Parse the SAUDI_BANKS object out of the TypeScript source.
const tsSource = await readFile("client/src/lib/saudi-banks.ts", "utf8");
const tableMatch = tsSource.match(/SAUDI_BANKS:\s*Record<[^>]+>\s*=\s*\{([\s\S]*?)\n\};/);
if (!tableMatch) {
  console.error("ERROR: could not parse SAUDI_BANKS from client/src/lib/saudi-banks.ts");
  process.exit(1);
}
const banks = {};
const rowRe = /"(\d{2})":\s*\{\s*name:\s*"([^"]+)",\s*code:\s*"([^"]+)"/g;
let m;
while ((m = rowRe.exec(tableMatch[1])) !== null) {
  banks[m[1]] = { name: m[2], code: m[3] };
}
console.log(`Loaded ${Object.keys(banks).length} bank mappings.`);

const url = DB_URL.replace("sslmode=require", "sslmode=no-verify");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows } = await client.query(`
  SELECT id, full_name_en, iban_number
  FROM candidates
  WHERE iban_number IS NOT NULL
    AND iban_bank_code IS NULL
    AND length(regexp_replace(iban_number, '\\s', '', 'g')) = 24
    AND regexp_replace(iban_number, '\\s', '', 'g') ~ '^SA[0-9]{22}$'
`);
console.log(`Found ${rows.length} candidate(s) with a valid IBAN but NULL bank code.`);

const buckets = new Map(); // code -> { name, count, ids: [] }
const unmatched = [];
for (const r of rows) {
  const clean = r.iban_number.replace(/\s+/g, "").toUpperCase();
  const code = clean.substring(4, 6);
  const bank = banks[code];
  if (!bank) {
    unmatched.push({ id: r.id, name: r.full_name_en, code, iban: clean });
    continue;
  }
  const key = code;
  if (!buckets.has(key)) buckets.set(key, { code, name: bank.name, bankCode: bank.code, count: 0, ids: [] });
  const b = buckets.get(key);
  b.count++;
  b.ids.push(r.id);
}

console.log("\nMatched (would update):");
for (const b of buckets.values()) {
  console.log(`  prefix=${b.code}  bank="${b.name}" (${b.bankCode})  count=${b.count}`);
}
if (unmatched.length > 0) {
  console.log(`\nUnmatched prefixes (${unmatched.length} candidates) — bank code still unknown:`);
  const counts = {};
  for (const u of unmatched) counts[u.code] = (counts[u.code] ?? 0) + 1;
  for (const [code, cnt] of Object.entries(counts)) console.log(`  prefix=${code}  count=${cnt}`);
}

if (!APPLY) {
  console.log("\nDry-run complete. Re-run with --apply to write changes.");
  await client.end();
  process.exit(0);
}

let updated = 0;
await client.query("BEGIN");
try {
  for (const b of buckets.values()) {
    const r = await client.query(
      `UPDATE candidates
         SET iban_bank_name = $1, iban_bank_code = $2
       WHERE id = ANY($3::text[])
         AND iban_bank_code IS NULL`,
      [b.name, b.bankCode, b.ids]
    );
    updated += r.rowCount;
    console.log(`  updated ${r.rowCount} row(s) for prefix ${b.code} → ${b.bankCode}`);
  }
  await client.query("COMMIT");
  console.log(`\nApplied. Total rows updated: ${updated}`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("ROLLBACK due to error:", e.message);
  process.exit(1);
}

await client.end();
