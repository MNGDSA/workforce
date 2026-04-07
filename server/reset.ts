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
 *   This means the reset stays correct as the schema grows without
 *   requiring manual edits to this file.
 *
 * Phase 2 — WIPE
 *   Dynamically truncates every non-config table with CASCADE.
 *   Removes all non-demo users.
 *
 * Phase 3 — RE-SEED
 *   Restores the three demo login accounts, automation rules,
 *   demo events, and demo job postings.
 *
 * Demo credentials preserved:
 *   Super Admin  —  1000000001 / 0500000001 / password123
 *   Candidate    —  2000000002 / 0500000002 / password123
 *   Recruiter    —  1000000003 / 0500000003 / password123
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { users, automationRules, events, jobPostings } from "@shared/schema";
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
  "smp_contracts",
  "smp_companies",
  "candidates",
  "automation_rules",
]);

const DEMO_NATIONAL_IDS = ["1000000001", "2000000002", "1000000003"];

// ─────────────────────────────────────────────────────────────────────────────

async function sweep(): Promise<string[]> {
  console.log("\n━━━  PHASE 1 — DB SWEEP  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Get every table in the public schema
  const result = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM   information_schema.tables
    WHERE  table_schema = 'public'
    AND    table_type   = 'BASE TABLE'
    ORDER  BY table_name
  `);

  const allTables = (result.rows as { table_name: string }[]).map((r) => r.table_name);

  // Row counts for each table
  const counts: Record<string, number> = {};
  for (const t of allTables) {
    const r = await db.execute<{ n: string }>(
      sql`SELECT COUNT(*)::int AS n FROM ${sql.raw(`"${t}"`)}`
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

  // Return the full list of tables to truncate (known + newly detected)
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
    const tableList = toWipe.map((t) => `"${t}"`).join(", ");
    await db.execute(sql`TRUNCATE ${sql.raw(tableList)} CASCADE`);
    console.log(`  ✓  Truncated ${toWipe.length} tables`);
  } else {
    console.log("  (nothing to truncate)");
  }

  // Remove non-demo users
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

  // ── Phase 3: Re-seed ──────────────────────────────────────────────────────
  console.log("\n━━━  PHASE 3 — RE-SEED  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const adminPassword     = await bcrypt.hash("password123", 12);
  const candidatePassword = await bcrypt.hash("password123", 12);

  await db
    .insert(users)
    .values([
      {
        username: "admin",
        email: "admin@workforce.sa",
        password: adminPassword,
        role: "super_admin",
        fullName: "System Administrator",
        phone: "0500000001",
        nationalId: "1000000001",
      },
      {
        username: "candidate",
        email: "candidate@workforce.sa",
        password: candidatePassword,
        role: "candidate",
        fullName: "Test Candidate",
        phone: "0500000002",
        nationalId: "2000000002",
      },
      {
        username: "recruiter1",
        email: "recruiter@workforce.sa",
        password: adminPassword,
        role: "recruiter",
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

  const insertedEvents = await db
    .insert(events)
    .values([
      {
        name: "Hajj 2026",
        description: "Annual Hajj pilgrimage event workforce deployment",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        status: "upcoming",
        targetHeadcount: 5000,
        filledPositions: 0,
        budget: "15000000.00",
        region: "Makkah",
      },
      {
        name: "Ramadan 2026",
        description: "Holy month operations and services",
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        status: "active",
        targetHeadcount: 2000,
        filledPositions: 0,
        budget: "5000000.00",
        region: "Nationwide",
      },
      {
        name: "National Day 2025",
        description: "Saudi National Day events and ceremonies",
        startDate: "2025-09-15",
        endDate: "2025-09-25",
        status: "closed",
        targetHeadcount: 800,
        filledPositions: 0,
        budget: "2000000.00",
        region: "Riyadh",
      },
    ])
    .returning();

  const hajjEvent    = insertedEvents[0];
  const ramadanEvent = insertedEvents[1];

  if (hajjEvent && ramadanEvent) {
    await db.insert(jobPostings).values([
      {
        title: "Ramadan 2026 Event Jobs",
        titleAr: "وظائف موسم رمضان 2026",
        description: "Event-based positions available for Ramadan 2026 operations across various departments.",
        requirements: "Minimum 1 year experience in the relevant field. Ability to work long hours during Ramadan.",
        location: "Makkah",
        region: "Makkah",
        department: "Operations",
        type: "seasonal_full_time",
        salaryMin: "4500.00",
        salaryMax: "6000.00",
        openings: 500,
        status: "active",
        eventId: ramadanEvent.id,
        deadline: "2026-05-15",
        skills: ["crowd management", "first aid", "communication"],
      },
      {
        title: "Shuttle Bus Driver",
        titleAr: "سائق حافلة المكوك",
        description: "Transport pilgrims between designated zones safely and efficiently.",
        requirements: "Valid Saudi driving license. CDL preferred. Clean driving record.",
        location: "Makkah",
        region: "Makkah",
        department: "Transportation",
        type: "seasonal_full_time",
        salaryMin: "5000.00",
        salaryMax: "7000.00",
        openings: 300,
        status: "active",
        eventId: ramadanEvent.id,
        deadline: "2026-05-01",
        skills: ["driving", "navigation", "customer service"],
      },
      {
        title: "Hajj 2026 Event Jobs",
        titleAr: "وظائف موسم الحج 2026",
        description: "Event-based positions available for Hajj 2026 operations including medical, logistics, and crowd management.",
        requirements: "Relevant certification required. BLS/ACLS preferred for medical roles.",
        location: "Mina & Arafat",
        region: "Makkah",
        department: "Medical",
        type: "seasonal_full_time",
        salaryMin: "7000.00",
        salaryMax: "10000.00",
        openings: 200,
        status: "active",
        eventId: hajjEvent.id,
        deadline: "2026-04-30",
        skills: ["first aid", "BLS", "emergency response"],
      },
      {
        title: "Food Service Coordinator",
        titleAr: "منسق خدمات الغذاء",
        description: "Coordinate large-scale food distribution operations for pilgrims.",
        requirements: "Food safety certification. Experience in large-scale catering preferred.",
        location: "Multiple Sites",
        region: "Makkah",
        department: "Catering",
        type: "seasonal_full_time",
        salaryMin: "3500.00",
        salaryMax: "5000.00",
        openings: 150,
        status: "draft",
        eventId: hajjEvent.id,
        deadline: "2026-05-20",
        skills: ["food safety", "logistics", "team coordination"],
      },
      {
        title: "Translation Services Officer",
        titleAr: "ضابط خدمات الترجمة",
        description: "Provide real-time translation assistance for international pilgrims.",
        requirements: "Fluency in Arabic plus 2 additional languages (English, Urdu, Indonesian, Turkish preferred).",
        location: "Holy Sites",
        region: "Makkah",
        department: "Guest Services",
        type: "seasonal_full_time",
        salaryMin: "6000.00",
        salaryMax: "9000.00",
        openings: 100,
        status: "active",
        eventId: hajjEvent.id,
        deadline: "2026-05-10",
        skills: ["translation", "multilingual", "cultural sensitivity"],
      },
    ]);
    console.log("  ✓  Demo events + job postings restored");
  }

  console.log("\n✅  Reset complete — clean slate with demo credentials.");
  console.log("   Super Admin  →  1000000001 / 0500000001 / password123");
  console.log("   Candidate    →  2000000002 / 0500000002 / password123");
  console.log("   Recruiter    →  1000000003 / 0500000003 / password123\n");
}

reset().catch((e) => {
  console.error("❌  Reset failed:", e);
  process.exit(1);
});
