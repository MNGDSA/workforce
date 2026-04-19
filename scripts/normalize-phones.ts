// Backfill script: audits and normalizes phone columns to canonical
// 05XXXXXXXX form (or permissive cleanup for international contact phones).
//
// Usage:
//   tsx scripts/normalize-phones.ts                  # dry-run (default)
//   tsx scripts/normalize-phones.ts --dry-run        # explicit dry-run
//   tsx scripts/normalize-phones.ts --apply          # write inside ONE txn
//
// Always emits a CSV report to ./.local/phone-normalize-report.csv with
// every row that needs (or needed) attention, classified by action:
//   normalize   — value rewritten to canonical form
//   clear       — value unsalvageable in dry-run; LISTED for manual review
//                 (NOT auto-cleared in apply mode — see below)
//   collision   — normalized value would collide with another row; flagged
//   ok          — already canonical (audited but not in CSV)
//
// Strict columns (must match ^05\d{8}$): users.phone, candidates.phone.
// Permissive columns (international landline OK, only whitespace cleanup):
//   candidates.emergency_contact_phone, smp_companies.contact_phone,
//   sms_broadcast_recipients.phone.
//
// In --apply mode the entire run executes inside a single transaction; if
// any single update fails the whole backfill rolls back. Unsalvageable
// rows are NEVER auto-deleted — they are reported for manual remediation.

import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { normalizeSaPhone, cleanContactPhone } from "../shared/phone";
import * as fs from "node:fs";
import * as path from "node:path";

const APPLY = process.argv.includes("--apply");
const REPORT_PATH = path.resolve(".local/phone-normalize-report.csv");

type Action = "normalize" | "clear" | "collision";
type Row = {
  table: string;
  id: string;
  column: string;
  before: string;
  after: string | null;
  action: Action;
  note?: string;
};

type StrictTarget = { table: "users" | "candidates"; column: "phone" };
type PermissiveTarget = {
  table: "candidates" | "smp_companies" | "sms_broadcast_recipients";
  column: "emergency_contact_phone" | "contact_phone" | "phone";
};

const STRICT: StrictTarget[] = [
  { table: "users", column: "phone" },
  { table: "candidates", column: "phone" },
];

const PERMISSIVE: PermissiveTarget[] = [
  { table: "candidates", column: "emergency_contact_phone" },
  { table: "smp_companies", column: "contact_phone" },
  { table: "sms_broadcast_recipients", column: "phone" },
];

async function fetchAll(table: string, column: string): Promise<{ id: string; v: string | null }[]> {
  const r = await db.execute(sql`SELECT id::text AS id, ${sql.raw(column)} AS v FROM ${sql.raw(table)} WHERE ${sql.raw(column)} IS NOT NULL`);
  return (r.rows as any[]).map((row) => ({ id: String(row.id), v: row.v == null ? null : String(row.v) }));
}

async function auditStrict(t: StrictTarget): Promise<Row[]> {
  const rows = await fetchAll(t.table, t.column);
  const out: Row[] = [];
  for (const r of rows) {
    if (!r.v) continue;
    const norm = normalizeSaPhone(r.v);
    if (norm === r.v) continue;
    if (norm) {
      out.push({ table: t.table, id: r.id, column: t.column, before: r.v, after: norm, action: "normalize" });
    } else {
      out.push({ table: t.table, id: r.id, column: t.column, before: r.v, after: null, action: "clear", note: "unsalvageable — manual review required" });
    }
  }
  return out;
}

async function auditPermissive(t: PermissiveTarget): Promise<Row[]> {
  const rows = await fetchAll(t.table, t.column);
  const out: Row[] = [];
  for (const r of rows) {
    if (!r.v) continue;
    const cleaned = cleanContactPhone(r.v);
    if (cleaned === r.v) continue;
    if (cleaned) {
      out.push({ table: t.table, id: r.id, column: t.column, before: r.v, after: cleaned, action: "normalize" });
    } else {
      out.push({ table: t.table, id: r.id, column: t.column, before: r.v, after: null, action: "clear", note: "unsalvageable — manual review required" });
    }
  }
  return out;
}

function csvField(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeReport(rows: Row[]) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const header = "table,id,column,action,before,after,note\n";
  const body = rows
    .map((r) => [r.table, r.id, r.column, r.action, r.before, r.after ?? "", r.note ?? ""].map(csvField).join(","))
    .join("\n");
  fs.writeFileSync(REPORT_PATH, header + body + (body ? "\n" : ""));
  console.log(`[report] wrote ${rows.length} row(s) to ${REPORT_PATH}`);
}

async function main() {
  console.log(`[normalize-phones] mode=${APPLY ? "APPLY (transactional)" : "DRY-RUN"}`);

  const rows: Row[] = [];
  for (const t of STRICT) rows.push(...(await auditStrict(t)));
  for (const t of PERMISSIVE) rows.push(...(await auditPermissive(t)));

  // Pre-flight collision detection for STRICT normalizations.
  for (const r of rows) {
    if (r.action !== "normalize" || !r.after) continue;
    const isStrict = STRICT.find((s) => s.table === r.table && s.column === r.column);
    if (!isStrict) continue;
    const collision = await db.execute(
      sql`SELECT id::text AS id FROM ${sql.raw(r.table)} WHERE ${sql.raw(r.column)} = ${r.after} AND id::text <> ${r.id} LIMIT 1`,
    );
    if ((collision.rows ?? []).length > 0) {
      r.action = "collision";
      r.note = `would collide with row ${(collision.rows[0] as any).id}`;
    }
  }

  console.log(`\nFindings: ${rows.length} row(s) require attention`);
  const counts = rows.reduce<Record<string, number>>((a, r) => { a[r.action] = (a[r.action] ?? 0) + 1; return a; }, {});
  console.log("By action:", counts);

  writeReport(rows);

  if (rows.length === 0) {
    console.log("Nothing to backfill — all phones already canonical/clean.");
    return;
  }

  if (!APPLY) {
    console.log("\n[dry-run] inspect .local/phone-normalize-report.csv, then re-run with --apply.");
    return;
  }

  // Apply: single transaction. Skip clears (manual review) and collisions
  // (require human decision). Only auto-apply normalize actions.
  const toApply = rows.filter((r) => r.action === "normalize" && r.after);
  console.log(`\n[apply] writing ${toApply.length} normalization(s) inside one transaction…`);
  console.log(`[apply] skipping ${counts.clear ?? 0} clear(s) and ${counts.collision ?? 0} collision(s) — see CSV.`);

  await db.transaction(async (tx) => {
    for (const r of toApply) {
      const hasUpdatedAt = r.table === "users" || r.table === "candidates";
      if (hasUpdatedAt) {
        await tx.execute(sql`UPDATE ${sql.raw(r.table)} SET ${sql.raw(r.column)} = ${r.after}, updated_at = now() WHERE id::text = ${r.id}`);
      } else {
        await tx.execute(sql`UPDATE ${sql.raw(r.table)} SET ${sql.raw(r.column)} = ${r.after} WHERE id::text = ${r.id}`);
      }
    }
  });

  console.log(`[apply] committed ${toApply.length} update(s).`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("[normalize-phones] FAILED — transaction rolled back if applicable:", e);
  process.exit(1);
});
