import { db } from "../db";
import { sql } from "drizzle-orm";

const CRITICAL_TABLES = [
  "users",
  "sessions",
  "candidates",
  "workforce",
  "events",
  "roles",
  "permissions",
  "attendance_records",
] as const;

export async function ensureCriticalTables(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  try {
    const result = await db.execute<{ table_name: string }>(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const present = new Set((result.rows ?? []).map((r) => r.table_name));
    const missing = CRITICAL_TABLES.filter((t) => !present.has(t));

    if (missing.length === 0) {
      log(`all ${CRITICAL_TABLES.length} critical tables present`, "ensure-tables");
      return;
    }

    const isProduction = process.env.NODE_ENV === "production";
    const msg = `missing critical tables: ${missing.join(", ")} — drizzle-kit push did not run successfully against this database`;

    if (isProduction) {
      log(msg, "ensure-tables");
      log("refusing to start — run `npm run db:push` against DATABASE_URL before redeploying", "ensure-tables");
      throw new Error(msg);
    } else {
      log(`WARNING: ${msg}`, "ensure-tables");
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("missing critical tables")) {
      throw err;
    }
    log(`ensure-critical-tables check failed: ${err}`, "ensure-tables");
  }
}
