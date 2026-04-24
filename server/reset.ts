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
 * Phase 3 — RE-SEED (RBAC + credentials + automation rules + demo data)
 *   1. Re-runs the boot-time RBAC seed so reset works even on a brand-new
 *      database where the server has never been started (without this the
 *      next step throws "system roles missing").
 *   2. Restores the demo login accounts.
 *   3. Provisions the candidate + workforce rows the e2e suites depend on:
 *        • 2000000002 → candidate (profileCompleted=true) + workforce E000001
 *          → drives EMPLOYEE-mode portal, used by the candidate-portal-flow,
 *            candidate-portal-main-view, candidate-photo-management and
 *            photo-upload-outage-toast suites.
 *        • 2000000005 → candidate (profileCompleted=true), NO workforce
 *          → drives CANDIDATE-mode portal, used by candidate-photo-management
 *            and photo-upload-outage-toast.
 *   4. Restores automation rules.
 *
 * Demo credentials preserved:
 *   Super Admin  —  1000000001 / 0500000001 / password123
 *   Candidate    —  2000000002 / 0500000002 / password123  (employee mode)
 *   Recruiter    —  1000000003 / 0500000003 / password123
 *   Candidate    —  2000000005 / 0500000005 / password123  (candidate mode)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "./db";
import { sql, eq, inArray } from "drizzle-orm";
import {
  users,
  automationRules,
  roles,
  candidates,
  workforce,
  attendanceSubmissions,
  inboxItems,
} from "@shared/schema";
import bcrypt from "bcrypt";

// ─── Tables that are NEVER wiped (config / reference data) ───────────────────
// RBAC (roles, permissions, role_permissions) is included so the Phase-3
// demo-user seed can resolve role IDs without the chicken-and-egg failure
// the original script suffered when these were auto-detected and truncated
// before the role lookup ran.
const KEEP_TABLES = new Set([
  "users",             // wiped selectively (demo accounts kept)
  "business_units",
  "system_settings",
  "sms_plugins",
  "printer_plugins",
  "contract_templates",
  "id_card_templates",
  "question_sets",
  "roles",
  "permissions",
  "role_permissions",
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

// Demo accounts that survive the user wipe. Order matters only for log output.
const DEMO_NATIONAL_IDS = [
  "1000000001", // Super Admin
  "1000000003", // Recruiter (kept for backward compatibility)
  "2000000002", // Candidate — EMPLOYEE mode (workforce E000001)
  "2000000005", // Candidate — CANDIDATE mode (no workforce)
];

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

  // ── Phase 3: Re-seed (RBAC + credentials + automation rules + demo data) ──
  console.log("\n━━━  PHASE 3 — RE-SEED  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Re-run the boot-time RBAC seed so this script works even when the server
  // has never been started against this database. seedRbac is idempotent
  // (UPSERT on roles.slug / permissions.key) so it's safe to call here even
  // when the rows already exist from a previous boot.
  const { seedRbac } = await import("./seed-rbac");
  await seedRbac((msg, src) => console.log(`  [${src ?? "rbac"}] ${msg}`));

  const adminPassword     = await bcrypt.hash("password123", 12);
  const candidatePassword = await bcrypt.hash("password123", 12);

  // Resolve role IDs from the (now-guaranteed) RBAC tables.
  const allRoles = await db.select().from(roles);
  const superAdminRoleId = allRoles.find((r) => r.slug === "super_admin")?.id;
  const candidateRoleId  = allRoles.find((r) => r.slug === "candidate")?.id;
  if (!superAdminRoleId || !candidateRoleId) {
    throw new Error("Reset: system roles missing — seed-rbac upsert returned no rows.");
  }
  // Recruiter is no longer a system role; demo recruiter falls back to Candidate
  // role so the user exists in the DB. Owner can re-assign in UI.
  // The demo accounts get inserted on a fresh DB and refreshed on a re-run.
  // Insert is conflict-tolerant (national_id, username, email and phone all
  // carry unique indexes — any of them can clash with a pre-existing row).
  // After the insert, every demo row is force-updated to the canonical
  // username / email / password / role so the e2e suites can rely on
  // `password123` regardless of what the row looked like before reset.
  type DemoUserSpec = {
    nationalId: string;
    username: string;
    email: string;
    password: string;
    roleId: string;
    fullName: string;
    phone: string;
  };
  const demoUserSpecs: DemoUserSpec[] = [
    {
      nationalId: "1000000001",
      username: "admin",
      email: "admin@workforce.sa",
      password: adminPassword,
      roleId: superAdminRoleId,
      fullName: "System Administrator",
      phone: "0500000001",
    },
    {
      nationalId: "2000000002",
      username: "candidate",
      email: "candidate@workforce.sa",
      password: candidatePassword,
      roleId: candidateRoleId,
      fullName: "Test Candidate",
      phone: "0500000002",
    },
    {
      // Recruiter is no longer a system role; demo recruiter falls back to
      // the Candidate role so the user exists. Owner can re-assign in the UI.
      nationalId: "1000000003",
      username: "recruiter1",
      email: "recruiter@workforce.sa",
      password: adminPassword,
      roleId: candidateRoleId,
      fullName: "Ahmad Al-Rashidi",
      phone: "0500000003",
    },
    {
      nationalId: "2000000005",
      username: "candidate2",
      email: "candidate2@workforce.sa",
      password: candidatePassword,
      roleId: candidateRoleId,
      fullName: "Test Candidate Mode",
      phone: "0500000005",
    },
  ];

  await db
    .insert(users)
    .values(demoUserSpecs.map(({ nationalId, ...rest }) => ({ nationalId, ...rest })))
    .onConflictDoNothing();

  // Force-refresh every demo row so password123 / canonical username / email
  // are always in effect — this is what protects the e2e suites from stale
  // pre-existing records (e.g. an old admin that came in with a different
  // password the first time someone hand-seeded the database).
  for (const spec of demoUserSpecs) {
    await db
      .update(users)
      .set({
        username: spec.username,
        email: spec.email,
        password: spec.password,
        roleId: spec.roleId,
        fullName: spec.fullName,
        phone: spec.phone,
        isActive: true,
        // Bump invalidation columns so any leftover web/mobile tokens from
        // before the reset can no longer be replayed against the new password.
        webTokensInvalidatedAt: new Date(),
        mobileTokensInvalidatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.nationalId, spec.nationalId));
  }
  console.log("  ✓  Demo users verified / restored (passwords force-refreshed to password123)");

  // ── Demo candidate + workforce rows (lock for the e2e suites) ─────────────
  // The candidates table was just truncated in Phase 2, so we always insert
  // fresh rows here. The lookups by user id keep this idempotent in the rare
  // event the script is re-run before a re-truncate happens.
  const demoUsers = await db
    .select()
    .from(users)
    .where(inArray(users.nationalId, DEMO_NATIONAL_IDS));
  const userByNationalId = new Map(demoUsers.map((u) => [u.nationalId, u]));

  // ─ 2000000002 → candidate + workforce E000001 (EMPLOYEE-mode user) ────────
  const employeeUser = userByNationalId.get("2000000002");
  if (employeeUser) {
    let employeeCandidateId: string;
    const [existingCandidate] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.userId, employeeUser.id));
    if (existingCandidate) {
      employeeCandidateId = existingCandidate.id;
      await db
        .update(candidates)
        .set({
          fullNameEn: "Test Candidate",
          nationalId: "2000000002",
          phone: "0500000002",
          profileCompleted: true,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, existingCandidate.id));
    } else {
      const [created] = await db
        .insert(candidates)
        .values({
          userId: employeeUser.id,
          fullNameEn: "Test Candidate",
          nationalId: "2000000002",
          phone: "0500000002",
          country: "SA",
          profileCompleted: true,
        })
        .returning();
      employeeCandidateId = created.id;
    }

    let employeeWorkforceId: string;
    const [existingWorkforce] = await db
      .select()
      .from(workforce)
      .where(eq(workforce.candidateId, employeeCandidateId));
    if (existingWorkforce) {
      employeeWorkforceId = existingWorkforce.id;
    } else {
      const [createdWorkforce] = await db
        .insert(workforce)
        .values({
          employeeNumber: "E000001",
          candidateId: employeeCandidateId,
          startDate: new Date().toISOString().slice(0, 10),
          salary: "4000",
          employmentType: "individual",
          isActive: true,
        })
        .returning();
      employeeWorkforceId = createdWorkforce.id;
    }
    console.log("  ✓  Demo candidate 2000000002 + workforce E000001 ready");

    // Pending attendance_verification inbox item — drives the
    // inbox-attendance-review e2e suite (Tests 3–6 click the first pending
    // row and assert the detail panel + approve/reject confirmation flow).
    // The Approve/Reject buttons on inbox.tsx only render when the row is
    // type=attendance_verification AND has an entityId pointing at a real
    // attendance_submissions row — Test 6's "approve with notes" eventually
    // hits PATCH /api/attendance-submissions/:id/approve, so we seed both.
    const [existingSubmission] = await db
      .select()
      .from(attendanceSubmissions)
      .where(eq(attendanceSubmissions.workforceId, employeeWorkforceId));
    let demoSubmissionId: string;
    if (existingSubmission) {
      demoSubmissionId = existingSubmission.id;
    } else {
      const [createdSubmission] = await db
        .insert(attendanceSubmissions)
        .values({
          workforceId: employeeWorkforceId,
          // Stub photos — the inbox renders <img src> so the element exists
          // even if the URL doesn't actually serve a file. Tests assert
          // visibility of the <img>, not pixel content.
          photoUrl: "/uploads/demo/attendance-submitted.jpg",
          referencePhotoUrl: "/uploads/demo/attendance-reference.jpg",
          gpsLat: "21.4225",   // Masjid Al-Haram (matches the seeded geofence)
          gpsLng: "39.8262",
          gpsAccuracy: "12.5",
          status: "flagged",
          rekognitionConfidence: "82.40",
          gpsInsideGeofence: true,
          flagReason: "Demo seed — pending review for the inbox e2e suite",
        })
        .returning();
      demoSubmissionId = createdSubmission.id;
    }

    const [existingInboxItem] = await db
      .select()
      .from(inboxItems)
      .where(eq(inboxItems.entityId, demoSubmissionId));
    if (!existingInboxItem) {
      await db.insert(inboxItems).values({
        type: "attendance_verification",
        priority: "high",
        status: "pending",
        title: "Attendance verification needed — Test Candidate",
        body: "Demo seed — flagged attendance submission awaiting review.",
        entityType: "attendance_submission",
        entityId: demoSubmissionId,
        metadata: {
          submittedPhotoUrl: "/uploads/demo/attendance-submitted.jpg",
          referencePhotoUrl: "/uploads/demo/attendance-reference.jpg",
          confidence: 82.4,
          gpsInside: true,
          gpsLat: 21.4225,
          gpsLng: 39.8262,
          candidateName: "Test Candidate",
          employeeNumber: "E000001",
          workforceId: employeeWorkforceId,
        },
      });
    }
    console.log("  ✓  Demo pending attendance_verification inbox item ready");
  } else {
    console.log("  ⚠️  Demo user 2000000002 not found — workforce row skipped");
  }

  // ─ 2000000005 → candidate only, no workforce (CANDIDATE-mode user) ────────
  const candidateModeUser = userByNationalId.get("2000000005");
  if (candidateModeUser) {
    const [existing] = await db
      .select()
      .from(candidates)
      .where(eq(candidates.userId, candidateModeUser.id));
    if (existing) {
      await db
        .update(candidates)
        .set({
          fullNameEn: "Test Candidate Mode",
          nationalId: "2000000005",
          phone: "0500000005",
          profileCompleted: true,
          updatedAt: new Date(),
        })
        .where(eq(candidates.id, existing.id));
    } else {
      await db.insert(candidates).values({
        userId: candidateModeUser.id,
        fullNameEn: "Test Candidate Mode",
        nationalId: "2000000005",
        phone: "0500000005",
        country: "SA",
        profileCompleted: true,
      });
    }
    console.log("  ✓  Demo candidate 2000000005 (no workforce) ready");
  } else {
    console.log("  ⚠️  Demo user 2000000005 not found — candidate row skipped");
  }

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
  console.log("   Candidate    →  2000000002 / 0500000002 / password123  (employee mode, E000001)");
  console.log("   Recruiter    →  1000000003 / 0500000003 / password123");
  console.log("   Candidate    →  2000000005 / 0500000005 / password123  (candidate mode)\n");
}

reset().catch((e) => {
  console.error("❌  Reset failed:", e);
  process.exit(1);
});
