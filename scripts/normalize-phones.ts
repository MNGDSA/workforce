// Backfill script: normalizes phone columns to canonical 05XXXXXXXX form.
// Usage: tsx scripts/normalize-phones.ts            # dry-run, prints CSV
//        tsx scripts/normalize-phones.ts --apply    # writes changes
//
// Affects: users.phone, candidates.phone (canonical SA mobile required)
// Reports (no rewrite) for permissive columns: candidates.emergency_contact_phone,
//   smp_companies.contact_phone, sms_broadcast_recipients.phone — these allow
//   international/landline numbers, so we only flag whitespace-trim opportunities.

import { db } from "../server/db";
import { users, candidates } from "../shared/schema";
import { normalizeSaPhone } from "../shared/phone";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

type Row = { table: string; id: string; column: string; before: string; after: string | null; action: "normalize" | "clear" | "skip" };

async function processStrict(
  table: "users" | "candidates",
  rows: { id: string; phone: string | null }[],
): Promise<Row[]> {
  const out: Row[] = [];
  for (const r of rows) {
    if (!r.phone) continue;
    const norm = normalizeSaPhone(r.phone);
    if (norm === r.phone) continue;
    if (norm) {
      out.push({ table, id: r.id, column: "phone", before: r.phone, after: norm, action: "normalize" });
    } else {
      out.push({ table, id: r.id, column: "phone", before: r.phone, after: null, action: "clear" });
    }
  }
  return out;
}

async function main() {
  console.log(`[normalize-phones] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const userRows = await db.select({ id: users.id, phone: users.phone }).from(users);
  const candRows = await db.select({ id: candidates.id, phone: candidates.phone }).from(candidates);

  const changes = [
    ...await processStrict("users", userRows),
    ...await processStrict("candidates", candRows),
  ];

  console.log(`\nTotals: users=${userRows.length} candidates=${candRows.length}  changes=${changes.length}`);

  if (changes.length === 0) {
    console.log("Nothing to backfill — all phones canonical.");
    return;
  }

  console.log("\ntable,id,column,action,before,after");
  for (const c of changes) {
    console.log(`${c.table},${c.id},${c.column},${c.action},${c.before},${c.after ?? ""}`);
  }

  if (!APPLY) {
    console.log("\n[dry-run] re-run with --apply to write.");
    return;
  }

  // Conflict-aware apply: if normalized value collides with another row, clear instead.
  for (const c of changes) {
    const tbl = c.table === "users" ? users : candidates;
    if (c.action === "normalize" && c.after) {
      const collision = await db.execute(sql`SELECT id FROM ${sql.identifier(c.table)} WHERE phone = ${c.after} AND id <> ${c.id} LIMIT 1`);
      if ((collision.rows ?? []).length > 0) {
        console.warn(`[collision] ${c.table}.${c.id}: ${c.before} → ${c.after} collides; clearing instead`);
        await db.execute(sql`UPDATE ${sql.identifier(c.table)} SET phone = NULL, updated_at = now() WHERE id = ${c.id}`);
      } else {
        await db.execute(sql`UPDATE ${sql.identifier(c.table)} SET phone = ${c.after}, updated_at = now() WHERE id = ${c.id}`);
      }
    } else if (c.action === "clear") {
      await db.execute(sql`UPDATE ${sql.identifier(c.table)} SET phone = NULL, updated_at = now() WHERE id = ${c.id}`);
    }
  }

  console.log(`\n[applied] ${changes.length} row(s) updated.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
