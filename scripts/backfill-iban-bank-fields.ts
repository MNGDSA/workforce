// Backfill script: populate ibanBankName / ibanBankCode on candidates that
// were written before Task #120 made every IBAN write auto-resolve the bank
// from the SARIE registry. Walks every candidate with a non-null
// `iban_number` and a NULL `iban_bank_code`, runs `resolveSaudiBank` from
// `server/lib/iban.ts`, and updates the row in place.
//
// Rows whose `iban_number` fails the new server validator (`validateSaudiIban`)
// are NEVER silently rewritten — they are reported on stdout (and in a CSV
// alongside) so an admin can fix them by hand. Same for rows that pass the
// validator but whose SARIE prefix is not in the SAUDI_BANKS registry.
//
// Idempotent: only touches rows where iban_bank_code IS NULL. Safe to re-run.
//
// Usage:
//   tsx scripts/backfill-iban-bank-fields.ts             # dry-run (default)
//   tsx scripts/backfill-iban-bank-fields.ts --dry-run   # explicit dry-run
//   tsx scripts/backfill-iban-bank-fields.ts --apply     # write in ONE txn
//
// Connects via DATABASE_URL using the same `server/db` pool as the app.

import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { resolveSaudiBank, validateSaudiIban, canonicalizeIban } from "../server/lib/iban";
import * as fs from "node:fs";
import * as path from "node:path";

type Row = {
  id: string;
  full_name_en: string | null;
  iban_number: string | null;
};

type InvalidRow = {
  id: string;
  name: string;
  iban: string;
  reason: string;
};

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

async function main() {
  const reportDir = path.join(process.cwd(), ".local");
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "iban-backfill-report.csv");

  console.log(`Mode: ${APPLY ? "APPLY (will write)" : "DRY-RUN (no writes)"}`);

  const result = await db.execute<Row>(sql`
    SELECT id, full_name_en, iban_number
      FROM candidates
     WHERE iban_number IS NOT NULL
       AND iban_bank_code IS NULL
  `);
  const rows: Row[] = result.rows;
  console.log(`Scanning ${rows.length} candidate(s) with non-null IBAN and NULL bank code.`);

  const toUpdate: Array<{
    id: string;
    name: string;
    canonical: string;
    bankName: string;
    bankCode: string;
  }> = [];
  const invalid: InvalidRow[] = [];
  const unmatched: InvalidRow[] = [];

  for (const r of rows) {
    const raw = r.iban_number ?? "";
    const v = validateSaudiIban(raw);
    if (!v.ok) {
      invalid.push({
        id: r.id,
        name: r.full_name_en ?? "",
        iban: canonicalizeIban(raw),
        reason: v.reason + (v.length !== undefined ? `(len=${v.length})` : ""),
      });
      continue;
    }
    const bank = resolveSaudiBank(v.canonical);
    if (!bank) {
      unmatched.push({
        id: r.id,
        name: r.full_name_en ?? "",
        iban: v.canonical,
        reason: `unknown_sarie_prefix(${v.canonical.substring(4, 6)})`,
      });
      continue;
    }
    toUpdate.push({
      id: r.id,
      name: r.full_name_en ?? "",
      canonical: v.canonical,
      bankName: bank.ibanBankName,
      bankCode: bank.ibanBankCode,
    });
  }

  // Group by bank for a compact summary.
  const buckets = new Map<string, { name: string; code: string; count: number }>();
  for (const u of toUpdate) {
    const key = u.bankCode;
    const b = buckets.get(key) ?? { name: u.bankName, code: u.bankCode, count: 0 };
    b.count++;
    buckets.set(key, b);
  }

  console.log(`\nMatched (would update): ${toUpdate.length} row(s)`);
  for (const b of buckets.values()) {
    console.log(`  ${b.code.padEnd(6)} ${b.name}  count=${b.count}`);
  }

  if (unmatched.length > 0) {
    console.log(`\nValid IBANs but unknown SARIE prefix (${unmatched.length}):`);
    for (const u of unmatched.slice(0, 10)) {
      console.log(`  id=${u.id}  iban=${u.iban}  ${u.reason}  name="${u.name}"`);
    }
    if (unmatched.length > 10) console.log(`  … and ${unmatched.length - 10} more`);
  }

  if (invalid.length > 0) {
    console.log(`\nInvalid IBANs — left untouched, please review manually (${invalid.length}):`);
    for (const m of invalid.slice(0, 10)) {
      console.log(`  id=${m.id}  iban="${m.iban}"  reason=${m.reason}  name="${m.name}"`);
    }
    if (invalid.length > 10) console.log(`  … and ${invalid.length - 10} more`);
  }

  // Always write a CSV report so admins have a durable audit trail.
  const csvLines: string[] = ["id,name,iban,status,reason_or_bank"];
  for (const u of toUpdate) {
    csvLines.push(csv([u.id, u.name, u.canonical, "matched", `${u.bankCode}|${u.bankName}`]));
  }
  for (const u of unmatched) {
    csvLines.push(csv([u.id, u.name, u.iban, "unmatched_prefix", u.reason]));
  }
  for (const m of invalid) {
    csvLines.push(csv([m.id, m.name, m.iban, "invalid", m.reason]));
  }
  fs.writeFileSync(reportPath, csvLines.join("\n") + "\n", "utf8");
  console.log(`\nReport written: ${reportPath}`);

  if (DRY_RUN) {
    console.log("\nDry-run complete. Re-run with --apply to write changes.");
    process.exit(0);
  }

  if (toUpdate.length === 0) {
    console.log("\nNothing to update. Done.");
    process.exit(0);
  }

  console.log(`\nApplying ${toUpdate.length} update(s) inside one transaction…`);
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const u of toUpdate) {
      // Idempotency guard: only update if iban_bank_code is still NULL.
      const r = await tx.execute<{ id: string }>(sql`
        UPDATE candidates
           SET iban_bank_name = ${u.bankName},
               iban_bank_code = ${u.bankCode}
         WHERE id = ${u.id}
           AND iban_bank_code IS NULL
        RETURNING id
      `);
      updated += r.rows.length;
    }
  });
  console.log(`Applied. Total rows updated: ${updated}`);
  process.exit(0);
}

function csv(fields: string[]): string {
  return fields
    .map((f) => {
      const s = f ?? "";
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    })
    .join(",");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
