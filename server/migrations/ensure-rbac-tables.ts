import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures the RBAC core tables (roles,
 * permissions, role_permissions) exist. Production deploys do not run
 * drizzle-kit push automatically, and these tables were introduced by the
 * RBAC rollout (see migrate-to-rbac.ts and seed-rbac.ts). Without them,
 * boot-time seedRbac and every requirePermission check would crash with
 * `relation "roles" does not exist`.
 *
 * Must run BEFORE ensureUserTokenAndRoleCols (because users.role_id
 * conceptually references roles.id) and BEFORE seedRbac. The CREATE TABLE
 * IF NOT EXISTS makes this a no-op on environments where drizzle-kit push
 * already ran.
 */
export async function ensureRbacTables(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS roles (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      slug varchar(64) NOT NULL UNIQUE,
      description text,
      color varchar(16),
      is_system boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS roles_slug_idx ON roles (slug)`,
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS permissions (
      key varchar(80) PRIMARY KEY,
      resource varchar(40) NOT NULL,
      action varchar(40) NOT NULL,
      description text NOT NULL,
      category varchar(64) NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS permissions_category_idx ON permissions (category)`,
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id varchar NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_key varchar(80) NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_pk ON role_permissions (role_id, permission_key)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON role_permissions (role_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS role_permissions_perm_idx ON role_permissions (permission_key)`,
  );

  log("RBAC tables (roles, permissions, role_permissions) ensured", "boot-migrate");
}
