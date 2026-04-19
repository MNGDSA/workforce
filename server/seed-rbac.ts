// Idempotent boot-time RBAC seed.
//   1. Upsert every permission key from the catalog.
//   2. Upsert the two system roles: Super Admin and Candidate.
//   3. Wire Candidate's fixed permission set into role_permissions.
//   4. Super Admin gets no rows in role_permissions — middleware short-circuits.

import { db } from "./db";
import { roles, permissions, rolePermissions } from "@shared/schema";
import {
  PERMISSION_CATALOG,
  CANDIDATE_PERMISSIONS,
  SUPER_ADMIN_SLUG,
  CANDIDATE_SLUG,
} from "@shared/permissions";
import { sql, eq, and, inArray, notInArray } from "drizzle-orm";

export async function seedRbac(log: (msg: string, src?: string) => void) {
  // 1. Upsert permissions
  const values = PERMISSION_CATALOG.map((p) => ({
    key: p.key,
    resource: p.resource,
    action: p.action,
    description: p.description,
    category: p.category,
  }));
  if (values.length) {
    await db
      .insert(permissions)
      .values(values)
      .onConflictDoUpdate({
        target: permissions.key,
        set: {
          resource: sql`excluded.resource`,
          action: sql`excluded.action`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
        },
      });
  }

  // Detect orphan permissions (in DB but not in code) — log only, don't delete.
  const codeKeys = new Set<string>(values.map((v) => v.key as string));
  const dbRows = await db.select({ key: permissions.key }).from(permissions);
  const orphans = dbRows.filter((r) => !codeKeys.has(r.key)).map((r) => r.key);
  if (orphans.length) {
    log(`Orphan permissions in DB (kept, not in code): ${orphans.join(", ")}`, "rbac-seed");
  }

  // 2. Upsert system roles
  const [superAdmin] = await db
    .insert(roles)
    .values({
      name: "Super Admin",
      slug: SUPER_ADMIN_SLUG,
      description: "Full system access. Cannot be edited or deleted.",
      color: "#dc2626",
      isSystem: true,
    })
    .onConflictDoUpdate({
      target: roles.slug,
      set: {
        name: "Super Admin",
        description: "Full system access. Cannot be edited or deleted.",
        isSystem: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  const [candidate] = await db
    .insert(roles)
    .values({
      name: "Candidate",
      slug: CANDIDATE_SLUG,
      description: "Mobile/portal user. Self-service permissions only.",
      color: "#0ea5e9",
      isSystem: true,
    })
    .onConflictDoUpdate({
      target: roles.slug,
      set: {
        name: "Candidate",
        description: "Mobile/portal user. Self-service permissions only.",
        isSystem: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  // 3. Reset Candidate role permissions to the fixed catalog set
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, candidate.id));
  if (CANDIDATE_PERMISSIONS.length) {
    await db.insert(rolePermissions).values(
      CANDIDATE_PERMISSIONS.map((key) => ({
        roleId: candidate.id,
        permissionKey: key,
      }))
    );
  }

  // 4. Super Admin keeps zero rows (middleware grants all)
  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, superAdmin.id));

  // 5. Default admin roles (non-system, editable). Created on first boot so the
  // Settings → Admin Users role dropdown is never empty. Permissions for these
  // are configured by the Super Admin in Settings → Roles & Access.
  const defaultAdminRoles: { name: string; slug: string; description: string; color: string }[] = [
    { name: "Admin",                   slug: "admin",                  description: "General back-office administrator.",                          color: "#2563eb" },
    { name: "HR Manager",              slug: "hr_manager",             description: "Manages HR operations and approvals.",                       color: "#7c3aed" },
    { name: "HR Specialist",           slug: "hr_specialist",          description: "Day-to-day HR work: candidates, onboarding, employees.",     color: "#059669" },
    { name: "HR Attendance Reviewer",  slug: "hr_attendance_reviewer", description: "Reviews attendance submissions and excuse requests.",        color: "#0891b2" },
    { name: "Auditor",                 slug: "auditor",                description: "Read-only access to records and audit logs.",                color: "#d97706" },
    { name: "Recruiter",               slug: "recruiter",              description: "Manages job postings, applications, and interviews.",        color: "#db2777" },
  ];
  await db
    .insert(roles)
    .values(defaultAdminRoles.map((r) => ({ ...r, isSystem: false })))
    .onConflictDoNothing({ target: roles.slug });

  log(
    `RBAC seed complete: ${values.length} permissions, 2 system roles + ${defaultAdminRoles.length} default admin roles, ${CANDIDATE_PERMISSIONS.length} candidate perms`,
    "rbac-seed"
  );

  return { superAdminId: superAdmin.id, candidateId: candidate.id };
}
