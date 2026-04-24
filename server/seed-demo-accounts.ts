/**
 * Seed Demo Test Accounts — non-destructive top-up.
 * ─────────────────────────────────────────────────────────────────────────────
 * Restores the three demo login accounts that every e2e suite under
 * `e2e-tests/suites/` expects, WITHOUT wiping any other tables. Safe to run
 * repeatedly and safe to call at boot in non-production environments.
 *
 *   Super Admin  →  1000000001 / 0500000001 / password123
 *   Candidate    →  2000000002 / 0500000002 / password123
 *   Recruiter    →  1000000003 / 0500000003 / password123
 *
 * Behaviour per account:
 *   • If the row is missing  → full INSERT with the canonical values.
 *   • If the row exists       → reset password to `password123`, ensure the
 *                               account is active and the system role is the
 *                               expected one. Username / email / phone /
 *                               fullName are LEFT ALONE so a developer who
 *                               renamed a fixture in their own dev DB does
 *                               not lose that change.
 *
 * Compare with `server/reset.ts`, which truncates transactional tables and is
 * far too destructive to run before every test execution. This file is the
 * surgical alternative: tests get a guaranteed login without touching candidate
 * applications, attendance records, photos, or anything else.
 */

import { db } from "./db";
import { users, roles } from "@shared/schema";
import { SUPER_ADMIN_SLUG, CANDIDATE_SLUG } from "@shared/permissions";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

export const DEMO_PASSWORD = "password123";

type DemoAccount = {
  username: string;
  email: string;
  fullName: string;
  phone: string;
  nationalId: string;
  roleSlug: string;
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: "admin",
    email: "admin@workforce.sa",
    fullName: "System Administrator",
    phone: "0500000001",
    nationalId: "1000000001",
    roleSlug: SUPER_ADMIN_SLUG,
  },
  {
    username: "candidate",
    email: "candidate@workforce.sa",
    fullName: "Test Candidate",
    phone: "0500000002",
    nationalId: "2000000002",
    roleSlug: CANDIDATE_SLUG,
  },
  {
    username: "recruiter1",
    email: "recruiter@workforce.sa",
    fullName: "Ahmad Al-Rashidi",
    phone: "0500000003",
    nationalId: "1000000003",
    // Recruiter is no longer a system role; the demo recruiter logs in via
    // the Candidate role (matches `server/reset.ts`).
    roleSlug: CANDIDATE_SLUG,
  },
];

type Logger = (msg: string, src?: string) => void;

export async function seedDemoAccounts(log: Logger = console.log) {
  // Resolve the role IDs we need. RBAC seed must have run first.
  const allRoles = await db.select().from(roles);
  const slugToId = new Map(allRoles.map((r) => [r.slug, r.id]));
  const superAdminId = slugToId.get(SUPER_ADMIN_SLUG);
  const candidateId = slugToId.get(CANDIDATE_SLUG);
  if (!superAdminId || !candidateId) {
    throw new Error(
      "seedDemoAccounts: system roles missing — seedRbac must run first.",
    );
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  let inserted = 0;
  let refreshed = 0;
  let unchanged = 0;

  for (const acct of DEMO_ACCOUNTS) {
    const expectedRoleId = slugToId.get(acct.roleSlug);
    if (!expectedRoleId) {
      throw new Error(
        `seedDemoAccounts: role '${acct.roleSlug}' missing from RBAC seed.`,
      );
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.nationalId, acct.nationalId))
      .limit(1);

    if (!existing) {
      await db.insert(users).values({
        username: acct.username,
        email: acct.email,
        password: passwordHash,
        roleId: expectedRoleId,
        fullName: acct.fullName,
        phone: acct.phone,
        nationalId: acct.nationalId,
        isActive: true,
      });
      inserted++;
      continue;
    }

    // Top-up: only fix the things tests actually need (password, active,
    // role). Leave display fields (username, email, phone, fullName) alone
    // so a developer's local edits survive the seed.
    const passwordOk = await bcrypt.compare(DEMO_PASSWORD, existing.password);
    const activeOk = existing.isActive === true;
    const roleOk = existing.roleId === expectedRoleId;

    if (passwordOk && activeOk && roleOk) {
      unchanged++;
      continue;
    }

    await db
      .update(users)
      .set({
        password: passwordOk ? existing.password : passwordHash,
        isActive: true,
        roleId: expectedRoleId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    refreshed++;
  }

  log(
    `Demo accounts ready: ${inserted} inserted, ${refreshed} refreshed, ${unchanged} unchanged`,
    "seed-demo",
  );

  return { inserted, refreshed, unchanged };
}

// CLI entry: `tsx server/seed-demo-accounts.ts`
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].endsWith("seed-demo-accounts.ts");

if (isDirectRun) {
  seedDemoAccounts(console.log)
    .then(() => {
      console.log("✅ Demo accounts seeded.");
      console.log(`   Super Admin  →  1000000001 / 0500000001 / ${DEMO_PASSWORD}`);
      console.log(`   Candidate    →  2000000002 / 0500000002 / ${DEMO_PASSWORD}`);
      console.log(`   Recruiter    →  1000000003 / 0500000003 / ${DEMO_PASSWORD}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ seedDemoAccounts failed:", err);
      process.exit(1);
    });
}
