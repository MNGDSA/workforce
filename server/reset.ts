/**
 * App Reset Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Wipes all operational/transactional data back to a clean slate while
 * preserving the three demo login credentials:
 *
 *   Super Admin  — 1000000001 / 0500000001 / password123
 *   Candidate    — 2000000002 / 0500000002 / password123
 *   Recruiter    — 1000000003 / 0500000003 / password123
 *
 * Kept intact (configuration / reference data):
 *   business_units, system_settings, sms_plugins, printer_plugins,
 *   contract_templates, id_card_templates, question_sets, automation_rules
 *
 * After wiping, the seed is re-run so the demo events and job postings are
 * restored to their original state.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { users, automationRules, events, jobPostings } from "@shared/schema";
import bcrypt from "bcryptjs";

const DEMO_NATIONAL_IDS = ["1000000001", "2000000002", "1000000003"];

async function reset() {
  console.log("🔄  Starting app reset…");

  // ── Step 1: Truncate all transactional / operational tables ──────────────
  // CASCADE handles FK dependencies automatically.
  await db.execute(sql`
    TRUNCATE
      audit_logs,
      notifications,
      otp_verifications,
      id_card_print_logs,
      attendance_records,
      schedule_assignments,
      schedule_templates,
      shifts,
      employee_assets,
      assets,
      candidate_contracts,
      interviews,
      onboarding,
      applications,
      workforce,
      job_postings,
      events,
      smp_contracts,
      candidates,
      automation_rules
    CASCADE
  `);
  console.log("✓  Transactional tables cleared");

  // ── Step 2: Remove non-demo users ────────────────────────────────────────
  await db.execute(
    sql`DELETE FROM users WHERE national_id NOT IN (${sql.join(
      DEMO_NATIONAL_IDS.map((id) => sql`${id}`),
      sql`, `
    )})`
  );
  console.log("✓  Non-demo users removed");

  // ── Step 3: Re-seed automation rules ────────────────────────────────────
  const adminPassword   = await bcrypt.hash("password123", 12);
  const candidatePassword = await bcrypt.hash("password123", 12);

  // Ensure all three demo users exist (in case one was missing)
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
  console.log("✓  Demo users verified / restored");

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
  console.log("✓  Automation rules restored");

  // ── Step 4: Re-seed demo events + job postings ───────────────────────────
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
    console.log("✓  Demo events + job postings restored");
  }

  console.log("\n✅  App reset complete — clean slate with demo credentials restored.");
  console.log("   Super Admin  →  1000000001 / 0500000001 / password123");
  console.log("   Candidate    →  2000000002 / 0500000002 / password123");
  console.log("   Recruiter    →  1000000003 / 0500000003 / password123");
}

reset().catch((e) => {
  console.error("❌  Reset failed:", e);
  process.exit(1);
});
