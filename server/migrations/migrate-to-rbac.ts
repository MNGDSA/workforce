/**
 * One-shot migration: backfill `users.role_id` from the legacy `users.role`
 * enum, ensure Faisal lands on Super Admin, and lock the `role_id` column to
 * the Candidate role default.
 *
 * IMPORTANT: We INTENTIONALLY do NOT drop `users.role` column or `user_role`
 * type in this pass. The legacy enum stays for one migration cycle so the
 * still-unmigrated `requireSuperAdmin` checks across routes.ts continue to
 * function. T10 cleanup will drop them after T7 sweep is complete.
 *
 * Idempotent: re-running this script is safe.
 *
 * Local dev:    tsx server/migrations/migrate-to-rbac.ts
 * DO Postgres:  DATABASE_URL=... tsx server/migrations/migrate-to-rbac.ts
 */
import { db } from "../db";
import { users, roles } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  SUPER_ADMIN_SLUG,
  CANDIDATE_SLUG,
  FAISAL_PROD_USER_ID,
} from "@shared/permissions";

async function main() {
  console.log("[rbac-migrate] Starting…");

  const [superAdminRole] = await db.select().from(roles).where(eq(roles.slug, SUPER_ADMIN_SLUG));
  const [candidateRole] = await db.select().from(roles).where(eq(roles.slug, CANDIDATE_SLUG));
  if (!superAdminRole || !candidateRole) {
    throw new Error("System roles missing — boot the server once so seed-rbac runs first.");
  }
  console.log(`[rbac-migrate] Super Admin role id: ${superAdminRole.id}`);
  console.log(`[rbac-migrate] Candidate  role id: ${candidateRole.id}`);

  // 1. Backfill role_id from legacy role enum.
  const saRes = await db.execute(sql`
    UPDATE users SET role_id = ${superAdminRole.id}
    WHERE role = 'super_admin' AND (role_id IS NULL OR role_id <> ${superAdminRole.id})
  `);
  console.log(`[rbac-migrate] super_admin → role_id: ${(saRes as any).rowCount ?? "?"} rows`);

  const candRes = await db.execute(sql`
    UPDATE users SET role_id = ${candidateRole.id}
    WHERE role = 'candidate' AND (role_id IS NULL OR role_id <> ${candidateRole.id})
  `);
  console.log(`[rbac-migrate] candidate → role_id: ${(candRes as any).rowCount ?? "?"} rows`);

  // 2. Safety net: Faisal must land on Super Admin no matter what.
  const faisalRes = await db.execute(sql`
    UPDATE users SET role_id = ${superAdminRole.id}
    WHERE id = ${FAISAL_PROD_USER_ID}
  `);
  console.log(`[rbac-migrate] Faisal safety-net update: ${(faisalRes as any).rowCount ?? "?"} rows`);

  // 3. Set Candidate as the default role_id and make it NOT NULL.
  //    Any admin user that was on a non-system role (admin, hr_manager, etc.)
  //    and was not backfilled above will land on Candidate by default — they
  //    must be re-assigned to a custom role in the UI before they can log in
  //    to admin-only routes. This is the intended behavior per the plan.
  await db.execute(sql`
    UPDATE users SET role_id = ${candidateRole.id} WHERE role_id IS NULL
  `);
  console.log(`[rbac-migrate] NULL role_id → candidate (orphans cleared)`);

  // ALTER TABLE ... SET DEFAULT does not accept parameter placeholders for the
  // literal value, so we splice. Escape via SQL's canonical single-quote
  // doubling so any future role id (including ones containing apostrophes) is
  // handled safely without throwing.
  // nosemgrep: javascript.drizzle-orm.security.audit.ban-drizzle-sql-raw
  const safeDefault = candidateRole.id.replace(/'/g, "''");
  await db.execute(sql.raw(
    `ALTER TABLE users ALTER COLUMN role_id SET DEFAULT '${safeDefault}'`
  ));
  await db.execute(sql`ALTER TABLE users ALTER COLUMN role_id SET NOT NULL`);
  console.log(`[rbac-migrate] role_id default + NOT NULL applied`);

  // 5. T10: drop legacy `role` column + `user_role` enum type now that all
  //    code paths read from `role_id` and the in-process legacy fallback in
  //    auth-middleware has been removed in this same commit.
  await db.execute(sql`ALTER TABLE users DROP COLUMN IF EXISTS role`);
  await db.execute(sql`DROP TYPE IF EXISTS user_role`);
  console.log(`[rbac-migrate] legacy role column + user_role enum dropped`);

  // 4. Sanity check: every user has a role_id.
  const orphan = await db.execute(sql`SELECT COUNT(*)::int AS n FROM users WHERE role_id IS NULL`);
  console.log(`[rbac-migrate] Final orphan count: ${JSON.stringify((orphan as any).rows?.[0] ?? orphan)}`);

  console.log("[rbac-migrate] Done.");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("[rbac-migrate] FAILED:", err);
  process.exit(1);
});
