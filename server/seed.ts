import { db } from "./db";
import { users, automationRules, geofenceZones, roles } from "@shared/schema";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database...");

  // ─── Super Admin (Founding) ───────────────────────────────────────────────
  // Faisal Alamri is the sole Super Admin. Created here on first seed only.
  // Additional admin users (HR, Auditor, etc.) are created through the
  // Settings → Admin Users UI and never via this script.
  const SUPER_ADMIN_NATIONAL_ID = "1071793531";
  const SUPER_ADMIN_PHONE = "0581766080";
  const SUPER_ADMIN_FULL_NAME = "Faisal Alamri";
  const SUPER_ADMIN_FULL_NAME_AR = "فيصل العمري";
  const SUPER_ADMIN_EMAIL = "faisal.alamri@workforce.sa";
  const SUPER_ADMIN_USERNAME = "faisal.alamri";
  const SUPER_ADMIN_PASSWORD = "Workforce@2026!";

  const existingSuperAdmin = await db
    .select()
    .from(users)
    .where(eq(users.nationalId, SUPER_ADMIN_NATIONAL_ID))
    .limit(1);

  // Resolve the Super Admin role id from the RBAC tables.
  const [superAdminRole] = await db.select().from(roles).where(eq(roles.slug, "super_admin"));
  if (!superAdminRole) {
    throw new Error("Seed: super_admin role missing — RBAC seed must run first.");
  }

  if (existingSuperAdmin.length === 0) {
    const hashed = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
    await db.insert(users).values({
      username: SUPER_ADMIN_USERNAME,
      email: SUPER_ADMIN_EMAIL,
      password: hashed,
      roleId: superAdminRole.id,
      fullName: SUPER_ADMIN_FULL_NAME,
      fullNameAr: SUPER_ADMIN_FULL_NAME_AR,
      phone: SUPER_ADMIN_PHONE,
      nationalId: SUPER_ADMIN_NATIONAL_ID,
      isActive: true,
    });
    console.log(`  → Created Super Admin: ${SUPER_ADMIN_FULL_NAME} (${SUPER_ADMIN_NATIONAL_ID})`);
  } else {
    const existing = existingSuperAdmin[0];
    const existingRole = existing.roleId
      ? (await db.select().from(roles).where(eq(roles.id, existing.roleId)))[0]
      : null;
    if (existingRole?.slug === "super_admin") {
      // Self-heal: backfill any missing bilingual fields onto the existing
      // super admin row (e.g. fullNameAr was added after this row was first
      // inserted). Idempotent: only writes the fields that are still empty
      // AT THE MOMENT OF UPDATE so we never clobber an admin-edited value
      // even under a concurrent write race (the WHERE clauses below carry
      // the no-clobber predicate down into the SQL itself, closing the
      // read→write TOCTOU window from the in-process check above).
      const patch: Record<string, unknown> = {};
      const guards: any[] = [];
      if (!(existing as any).fullNameAr) {
        patch.fullNameAr = SUPER_ADMIN_FULL_NAME_AR;
        guards.push(sql`(${users.fullNameAr} IS NULL OR ${users.fullNameAr} = '')`);
      }
      if (!existing.fullName) {
        patch.fullName = SUPER_ADMIN_FULL_NAME;
        guards.push(sql`(${users.fullName} IS NULL OR ${users.fullName} = '')`);
      }
      if (Object.keys(patch).length > 0) {
        // and-together: id matches AND every column we're trying to write
        // is still empty in the DB right now.
        let whereClause: any = eq(users.id, existing.id);
        for (const g of guards) whereClause = sql`${whereClause} AND ${g}`;
        const result = await db.update(users).set(patch).where(whereClause);
        console.log(
          `  → Super Admin ${SUPER_ADMIN_FULL_NAME} present; backfilled missing fields: ${Object.keys(patch).join(", ")} (rows affected: ${(result as any).rowCount ?? "?"}).`,
        );
      } else {
        console.log(`  → Super Admin ${SUPER_ADMIN_FULL_NAME} already provisioned, skipping.`);
      }
    } else {
      // National ID is reserved for Faisal. If a non-super-admin record already
      // holds it (e.g. a candidate self-registered with the same NID), promote
      // it deterministically rather than leaving the system without a Super Admin.
      const hashed = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
      await db
        .update(users)
        .set({
          username: SUPER_ADMIN_USERNAME,
          email: SUPER_ADMIN_EMAIL,
          password: hashed,
          fullName: SUPER_ADMIN_FULL_NAME,
          fullNameAr: SUPER_ADMIN_FULL_NAME_AR,
          phone: SUPER_ADMIN_PHONE,
          isActive: true,
        })
        .where(eq(users.id, existing.id));
      console.log(
        `  → Promoted existing record (was role='${existingRole?.slug ?? "none"}') for national ID ${SUPER_ADMIN_NATIONAL_ID} to Super Admin.`,
      );
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
