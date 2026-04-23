// scripts/snapchat-cleanup.ts ─ Backfill cleanup for the April 23 2026
// Snapchat-pollution incident.
//
// What happened:
//   A single Snapchat campaign that went live around 09:00 KSA on
//   2026-04-23 produced 1,708 candidate registrations in one day vs ~3
//   on a typical day. Snapchat's in-app browser autofills the apply
//   form's "Full Name" field with the user's profile display name —
//   often emoji-laden, often Unicode mathematical-bold styled — and
//   pasted the SAME phone into both the personal and emergency-contact
//   tel inputs. We measured 21 rows with control characters, 36 where
//   emergency_name == fullNameEn, and 239 where emergency_phone ==
//   personal phone, all from this campaign.
//
// Going forward, the apply form (client + server) now sanitises
// fullNameEn and rejects same-value duplicates. This script cleans up
// the rows that were inserted *before* the fix shipped.
//
// What this script does, per row, INSIDE A SINGLE TRANSACTION:
//   1. Re-runs `sanitizeHumanName` on `full_name_en`. If the canonical
//      form differs (emoji removed, math-bold folded to ASCII), update
//      the column to the cleaned value.
//   2. If `emergency_contact_phone` (digits-only) equals `phone`
//      (digits-only), NULL the emergency phone so the gate re-prompts
//      it on the candidate's next login.
//   3. If `emergency_contact_name` (case-insensitive trim) equals
//      `full_name_en`, NULL the emergency name for the same reason.
//   4. If we changed *anything*, set `profile_completed = false` so the
//      ProfileSetupGate re-runs and the candidate fills the cleared /
//      cleaned fields — and the IBAN holder name page (Task #137) gets
//      a fresh, English-only re-collection while we're at it.
//
// Usage:
//   tsx scripts/snapchat-cleanup.ts                       # dry-run
//   tsx scripts/snapchat-cleanup.ts --apply               # commit changes
//   tsx scripts/snapchat-cleanup.ts --since 2026-04-22    # custom window
//
// A CSV report is always written to `.local/snapchat-cleanup-report.csv`
// listing every row touched (dry-run or apply) with the before/after
// values for each affected column, so the on-call engineer can audit.

import { Client } from "pg";
import fs from "node:fs";
import path from "node:path";
import { sanitizeHumanName } from "../shared/name-sanitizer";

type Row = {
  id: string;
  full_name_en: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  profile_completed: boolean | null;
  created_at: Date;
};

type Update = {
  id: string;
  fullNameEnBefore: string | null;
  fullNameEnAfter: string | null;
  emergencyNameCleared: boolean;
  emergencyPhoneCleared: boolean;
  profileCompletedReset: boolean;
};

function parseArgs(argv: string[]): { apply: boolean; since: string } {
  const apply = argv.includes("--apply");
  const sinceIdx = argv.indexOf("--since");
  // Default window: anything created on or after 2026-04-23 KSA midnight
  // (the campaign launch). Caller can widen to catch earlier pollution.
  const since = sinceIdx >= 0 ? argv[sinceIdx + 1] : "2026-04-23";
  return { apply, since };
}

function digitsOnly(v: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

function planUpdate(row: Row): Update | null {
  // --- 1. fullNameEn sanitation --------------------------------------------
  let fullNameAfter: string | null = row.full_name_en;
  let nameChanged = false;
  if (row.full_name_en) {
    const r = sanitizeHumanName(row.full_name_en);
    if (r.ok && r.changed) {
      fullNameAfter = r.canonical;
      nameChanged = true;
    } else if (!r.ok) {
      // Sanitiser rejected the value entirely (no letters left, etc.).
      // We DON'T null this — the candidate would lose their identity.
      // Instead leave it and rely on the next login to re-collect via
      // a forthcoming "completeness" pass. Flag in the report.
      fullNameAfter = row.full_name_en;
    }
  }
  // --- 2. emergency phone duplication --------------------------------------
  const phoneClash =
    !!row.phone &&
    !!row.emergency_contact_phone &&
    digitsOnly(row.phone) === digitsOnly(row.emergency_contact_phone);
  // --- 3. emergency name duplication ---------------------------------------
  // Compare AGAINST the cleaned fullNameEn so we catch e.g. "Bandar 🌷"
  // vs "Bandar" duplicates that were saved before sanitation.
  const compareName = (fullNameAfter ?? row.full_name_en ?? "").trim().toLowerCase();
  const compareEmergency = (row.emergency_contact_name ?? "").trim().toLowerCase();
  const nameClash = !!compareName && !!compareEmergency && compareName === compareEmergency;

  if (!nameChanged && !phoneClash && !nameClash) return null;

  return {
    id: row.id,
    fullNameEnBefore: row.full_name_en,
    fullNameEnAfter: nameChanged ? fullNameAfter : null,
    emergencyNameCleared: nameClash,
    emergencyPhoneCleared: phoneClash,
    // Only force re-run of the gate if we cleared something the gate
    // collects. Pure name sanitation doesn't need a re-run.
    profileCompletedReset: phoneClash || nameClash,
  };
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const { apply, since } = parseArgs(process.argv.slice(2));
  const url = (process.env.PROD_DATABASE_URL || process.env.DATABASE_URL || "")
    .replace("sslmode=require", "sslmode=no-verify");
  if (!url) {
    console.error("ERROR: PROD_DATABASE_URL (or DATABASE_URL) must be set.");
    process.exit(1);
  }
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log(`[snapchat-cleanup] mode=${apply ? "APPLY" : "DRY-RUN"} since=${since}`);

  // We process rows from the campaign window. Widen with --since if the
  // pollution turns out to predate the suspected launch.
  const { rows } = await client.query<Row>(
    `SELECT id, full_name_en, phone, emergency_contact_name,
            emergency_contact_phone, profile_completed, created_at
       FROM candidates
      WHERE created_at >= $1::date
      ORDER BY created_at ASC`,
    [since],
  );

  const updates: Update[] = [];
  for (const row of rows) {
    const u = planUpdate(row);
    if (u) updates.push(u);
  }

  console.log(`[snapchat-cleanup] scanned ${rows.length} rows, ${updates.length} need cleanup`);

  // ── CSV report ──
  const reportPath = path.resolve(".local/snapchat-cleanup-report.csv");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const header = [
    "candidate_id",
    "full_name_en_before",
    "full_name_en_after",
    "emergency_name_cleared",
    "emergency_phone_cleared",
    "profile_completed_reset",
  ].join(",");
  const lines = updates.map((u) => [
    u.id,
    csvEscape(u.fullNameEnBefore),
    csvEscape(u.fullNameEnAfter),
    u.emergencyNameCleared,
    u.emergencyPhoneCleared,
    u.profileCompletedReset,
  ].join(","));
  fs.writeFileSync(reportPath, [header, ...lines].join("\n") + "\n");
  console.log(`[snapchat-cleanup] report → ${reportPath}`);

  if (!apply) {
    console.log("[snapchat-cleanup] dry-run — no DB writes. Re-run with --apply to commit.");
    await client.end();
    return;
  }

  // ── Apply inside a single transaction ──
  await client.query("BEGIN");
  try {
    for (const u of updates) {
      const sets: string[] = [];
      const params: unknown[] = [];
      if (u.fullNameEnAfter !== null) {
        params.push(u.fullNameEnAfter);
        sets.push(`full_name_en = $${params.length}`);
      }
      if (u.emergencyNameCleared) {
        sets.push(`emergency_contact_name = NULL`);
      }
      if (u.emergencyPhoneCleared) {
        sets.push(`emergency_contact_phone = NULL`);
      }
      if (u.profileCompletedReset) {
        sets.push(`profile_completed = FALSE`);
      }
      // Always bump updated_at so audit trails reflect the cleanup.
      sets.push(`updated_at = NOW()`);
      params.push(u.id);
      await client.query(
        `UPDATE candidates SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params,
      );
    }
    await client.query("COMMIT");
    console.log(`[snapchat-cleanup] APPLIED ${updates.length} updates in one transaction.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[snapchat-cleanup] FAILED — rolled back.", err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
