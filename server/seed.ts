import { db } from "./db";
import { users, automationRules, events, jobPostings, smpCompanies } from "@shared/schema";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database...");

  // ─── Admin Users ──────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash("password123", 12);
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

  // ─── Automation Rules ─────────────────────────────────────────────────────
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

  // ─── Events ───────────────────────────────────────────────────────────────
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
        filledPositions: 1240,
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
        filledPositions: 1850,
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
        filledPositions: 800,
        budget: "2000000.00",
        region: "Riyadh",
      },
    ])
    .onConflictDoNothing()
    .returning();

  const hajjEvent = insertedEvents[0];
  const ramadanEvent = insertedEvents[1];

  if (!hajjEvent || !ramadanEvent) {
    console.log("⚠️  Events already exist — skipping job postings seed");
  } else {
    // ─── Job Postings ─────────────────────────────────────────────────────────
    await db
      .insert(jobPostings)
      .values([
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
      ])
      .onConflictDoNothing();
  }

  // ─── SMP Companies ────────────────────────────────────────────────────────
  const existingSmpCompanies = await db.select({ id: smpCompanies.id }).from(smpCompanies).limit(1);
  if (existingSmpCompanies.length === 0) {
    await db.insert(smpCompanies).values([
      {
        name: "Al-Rashidi Manpower Services",
        crNumber: "4030123456",
        contactPerson: "Ahmed Al-Rashidi",
        contactPhone: "0512345678",
        contactEmail: "contact@alrashidi.com.sa",
        bankName: "Al Rajhi Bank",
        bankIban: "SA4420000001234567891234",
        region: "Mecca",
        notes: "Primary SMP partner for Hajj season staffing. Specializes in crowd management and guidance services.",
        isActive: true,
      },
      {
        name: "Najd Labor Solutions Co.",
        crNumber: "1010987654",
        contactPerson: "Khalid Al-Najdi",
        contactPhone: "0551234567",
        contactEmail: "ops@najdlabor.sa",
        bankName: "Saudi National Bank",
        bankIban: "SA6280000000608010167519",
        region: "Riyadh",
        notes: "Provides general labor workforce for seasonal operations.",
        isActive: true,
      },
      {
        name: "Jeddah Staffing Partners Ltd.",
        crNumber: "4030567890",
        contactPerson: "Fatima Al-Zahrani",
        contactPhone: "0561234567",
        contactEmail: "info@jeddahstaffing.com",
        bankName: "Riyad Bank",
        bankIban: "SA8420000002480040105576",
        region: "Jeddah",
        notes: "Specialized in hospitality and transport sector staffing.",
        isActive: false,
      },
    ]);
  }

  console.log("✅ Seed complete!");
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
