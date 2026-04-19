/**
 * App Reset Script  —  with DB Sweep
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 1 — DB SWEEP
 *   Queries the live database for every table in the public schema and
 *   compares against two known lists:
 *     KEEP_TABLES     → configuration / reference tables, never wiped
 *     KNOWN_WIPE      → transactional tables, always wiped
 *   Any table found in the DB that is NOT on either list is flagged as
 *   "newly discovered" and is automatically added to the wipe.
 *
 * Phase 2 — WIPE
 *   Dynamically truncates every non-config table with CASCADE.
 *   Removes all non-demo users.
 *
 * Phase 3 — RE-SEED (credentials + automation rules only)
 *   Restores the three demo login accounts and automation rules.
 *   No events, job postings, SMP companies, or workforce records are seeded.
 *
 * Demo credentials preserved:
 *   Super Admin  —  1000000001 / 0500000001 / password123
 *   Candidate    —  2000000002 / 0500000002 / password123
 *   Recruiter    —  1000000003 / 0500000003 / password123
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { users, automationRules, roles } from "@shared/schema";
import bcrypt from "bcryptjs";

// ─── Tables that are NEVER wiped (config / reference data) ───────────────────
const KEEP_TABLES = new Set([
  "users",             // wiped selectively (demo accounts kept)
  "business_units",
  "system_settings",
  "sms_plugins",
  "printer_plugins",
  "contract_templates",
  "id_card_templates",
  "question_sets",
]);

// ─── Tables we know should be wiped (used only for reporting "known vs new") ──
const KNOWN_WIPE = new Set([
  "audit_logs",
  "notifications",
  "otp_verifications",
  "id_card_print_logs",
  "attendance_records",
  "schedule_assignments",
  "schedule_templates",
  "shifts",
  "employee_assets",
  "assets",
  "candidate_contracts",
  "interviews",
  "onboarding",
  "applications",
  "workforce",
  "job_postings",
  "events",
  "smp_documents",
  "smp_companies",
  "candidates",
  "automation_rules",
  "photo_change_requests",
]);

const DEMO_NATIONAL_IDS = ["1000000001", "2000000002", "1000000003"];

// ─────────────────────────────────────────────────────────────────────────────

async function sweep(): Promise<string[]> {
  console.log("\n━━━  PHASE 1 — DB SWEEP  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const result = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM   information_schema.tables
    WHERE  table_schema = 'public'
    AND    table_type   = 'BASE TABLE'
    ORDER  BY table_name
  `);

  const allTables = (result.rows as { table_name: string }[]).map((r) => r.table_name);

  const counts: Record<string, number> = {};
  for (const t of allTables) {
    // sql.identifier handles reserved words and any embedded quote characters
    // safely — no manual string escaping. Source is information_schema.tables
    // (same session); identifier escaping is defense in depth.
    const r = await db.execute<{ n: string }>(
      sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(t)}`
    );
    counts[t] = Number((r.rows as { n: string }[])[0]?.n ?? 0);
  }

  const keepList:      string[] = [];
  const knownWipe:     string[] = [];
  const newlyDetected: string[] = [];

  for (const t of allTables) {
    if (KEEP_TABLES.has(t))     keepList.push(t);
    else if (KNOWN_WIPE.has(t)) knownWipe.push(t);
    else                         newlyDetected.push(t);
  }

  console.log(`\n  Tables found in DB: ${allTables.length}`);

  console.log("\n  KEPT (config / reference):");
  for (const t of keepList)
    console.log(`    ✓ ${t.padEnd(28)} ${counts[t]} row(s)`);

  console.log("\n  WIPE — known transactional:");
  for (const t of knownWipe)
    console.log(`    ✗ ${t.padEnd(28)} ${counts[t]} row(s)`);

  if (newlyDetected.length > 0) {
    console.log("\n  WIPE — ⚠️  newly detected tables (not in original KNOWN_WIPE list):");
    for (const t of newlyDetected)
      console.log(`    ✗ ${t.padEnd(28)} ${counts[t]} row(s)  ← auto-added to wipe`);
  } else {
    console.log("\n  ✓  No new tables detected — schema matches expected.");
  }

  return [...knownWipe, ...newlyDetected];
}

// ─────────────────────────────────────────────────────────────────────────────

async function reset() {
  console.log("🔄  Starting app reset…");

  // ── Phase 1: Sweep ────────────────────────────────────────────────────────
  const toWipe = await sweep();

  // ── Phase 2: Wipe ─────────────────────────────────────────────────────────
  console.log("\n━━━  PHASE 2 — WIPE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (toWipe.length > 0) {
    // sql.identifier per name + sql.join → properly escaped, comma-separated
    // identifier list. Equivalent to: TRUNCATE "t1", "t2", "t3" CASCADE.
    const idents = sql.join(toWipe.map((t) => sql.identifier(t)), sql`, `);
    await db.execute(sql`TRUNCATE ${idents} CASCADE`);
    console.log(`  ✓  Truncated ${toWipe.length} tables`);
  } else {
    console.log("  (nothing to truncate)");
  }

  const deleted = await db.execute(
    sql`DELETE FROM users WHERE national_id NOT IN (${sql.join(
      DEMO_NATIONAL_IDS.map((id) => sql`${id}`),
      sql`, `
    )}) RETURNING national_id`
  );
  const removedCount = (deleted.rows as unknown[]).length;
  if (removedCount > 0)
    console.log(`  ✓  Removed ${removedCount} non-demo user(s)`);
  else
    console.log("  ✓  No non-demo users to remove");

  // ── Phase 3: Re-seed (credentials + automation rules only) ────────────────
  console.log("\n━━━  PHASE 3 — RE-SEED  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const adminPassword     = await bcrypt.hash("password123", 12);
  const candidatePassword = await bcrypt.hash("password123", 12);

  // Resolve role IDs from the RBAC tables. Boot seed must have run first.
  const allRoles = await db.select().from(roles);
  const superAdminRoleId = allRoles.find((r) => r.slug === "super_admin")?.id;
  const candidateRoleId  = allRoles.find((r) => r.slug === "candidate")?.id;
  if (!superAdminRoleId || !candidateRoleId) {
    throw new Error("Reset: system roles missing — boot the server once so seed-rbac runs first.");
  }
  // Recruiter is no longer a system role; demo recruiter falls back to Candidate
  // role so the user exists in the DB. Owner can re-assign in UI.
  await db
    .insert(users)
    .values([
      {
        username: "admin",
        email: "admin@workforce.sa",
        password: adminPassword,
        roleId: superAdminRoleId,
        fullName: "System Administrator",
        phone: "0500000001",
        nationalId: "1000000001",
      },
      {
        username: "candidate",
        email: "candidate@workforce.sa",
        password: candidatePassword,
        roleId: candidateRoleId,
        fullName: "Test Candidate",
        phone: "0500000002",
        nationalId: "2000000002",
      },
      {
        username: "recruiter1",
        email: "recruiter@workforce.sa",
        password: adminPassword,
        roleId: candidateRoleId,
        fullName: "Ahmad Al-Rashidi",
        phone: "0500000003",
        nationalId: "1000000003",
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓  Demo users verified / restored");

  await db
    .insert(automationRules)
    .values([
      {
        name: "Auto-Welcome SMS",
        description: "Send a welcome SMS to new candidates upon profile creation",
        trigger: "candidate.created",
        action: "sms.send",
        isEnabled: true,
        config: { template: "welcome_sms", channel: "goinfinito" },
      },
      {
        name: "Interview Reminder",
        description: "Send an SMS reminder 24 hours before a scheduled interview",
        trigger: "interview.scheduled",
        action: "sms.send",
        isEnabled: true,
        config: { template: "interview_reminder", hoursBeforeEvent: 24 },
      },
      {
        name: "Document Alert",
        description: "Alert candidates with incomplete documentation after 72 hours",
        trigger: "candidate.incomplete_profile",
        action: "sms.send",
        isEnabled: false,
        config: { template: "document_alert", afterHours: 72 },
      },
      {
        name: "Auto-Approve Applications",
        description: "Automatically approve applications meeting minimum criteria",
        trigger: "application.submitted",
        action: "application.approve",
        isEnabled: false,
        config: { minRating: 4.0, minExperience: 1 },
      },
      {
        name: "Offboarding Notification",
        description: "Notify workforce members 7 days before contract end",
        trigger: "workforce.contract_ending",
        action: "notification.send",
        isEnabled: true,
        config: { template: "offboarding_notice", daysBeforeEnd: 7 },
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓  Automation rules restored");

  console.log("\n✅  Reset complete — clean slate with demo credentials.");
  console.log("   Super Admin  →  1000000001 / 0500000001 / password123");
  console.log("   Candidate    →  2000000002 / 0500000002 / password123");
  console.log("   Recruiter    →  1000000003 / 0500000003 / password123\n");
}

reset().catch((e) => {
  console.error("❌  Reset failed:", e);
  process.exit(1);
});
