import { db } from "./db";
import { users, candidates, automationRules, geofenceZones } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

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

  // ─── Candidate Record for Test Candidate ────────────────────────────────
  const [candidateUser] = await db
    .select()
    .from(users)
    .where(eq(users.nationalId, "2000000002"))
    .limit(1);

  if (candidateUser) {
    const existingCandidate = await db
      .select()
      .from(candidates)
      .where(eq(candidates.userId, candidateUser.id))
      .limit(1);

    if (existingCandidate.length === 0) {
      await db
        .insert(candidates)
        .values({
          userId: candidateUser.id,
          fullNameEn: "Test Candidate",
          fullNameAr: "مرشح تجريبي",
          nationalId: "2000000002",
          phone: "0500000002",
          email: "candidate@workforce.sa",
          gender: "male",
          nationality: "saudi",
          city: "Makkah",
          region: "Makkah Region",
          country: "SA",
          status: "active",
          source: "individual",
          profileCompleted: true,
        })
        .onConflictDoNothing();
      console.log("  → Created candidate record for Test Candidate");
    }
  }

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

  // ─── Geofence Zones ────────────────────────────────────────────────────────
  await db
    .insert(geofenceZones)
    .values([
      {
        name: "Masjid Al-Haram Complex",
        centerLat: "21.4225000",
        centerLng: "39.8262000",
        radiusMeters: 800,
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  console.log("✅ Seed complete!");
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
