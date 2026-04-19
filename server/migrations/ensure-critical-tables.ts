import { db } from "../db";
import { sql } from "drizzle-orm";
import { execSync } from "child_process";

const CRITICAL_TABLES = [
  "users",
  "candidates",
  "workforce",
  "events",
  "roles",
  "permissions",
  "attendance_records",
] as const;

async function getMissing(): Promise<string[]> {
  const result = await db.execute<{ table_name: string }>(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  const present = new Set((result.rows ?? []).map((r) => r.table_name));
  return CRITICAL_TABLES.filter((t) => !present.has(t));
}

export async function ensureCriticalTables(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";

  let missing: string[];
  try {
    missing = await getMissing();
  } catch (err) {
    const msg = `unable to verify critical tables: ${err}`;
    if (isProduction) {
      log(msg, "ensure-tables");
      throw new Error(msg);
    }
    log(`WARNING: ${msg}`, "ensure-tables");
    return;
  }

  if (missing.length === 0) {
    log(`all ${CRITICAL_TABLES.length} critical tables present`, "ensure-tables");
    return;
  }

  log(`missing critical tables: ${missing.join(", ")}`, "ensure-tables");

  if (!isProduction) {
    log("WARNING: dev environment, continuing", "ensure-tables");
    return;
  }

  // Production fallback: drizzle-kit push didn't run during build, or this
  // is a fresh DB. Try to run it now from the running container, then
  // re-verify. If it still fails, refuse to start.
  log("attempting recovery: running drizzle-kit push --force", "ensure-tables");
  try {
    execSync("npx drizzle-kit push --force", {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
      timeout: 120_000,
    });
  } catch (err) {
    const msg = `recovery push failed: ${err}`;
    log(msg, "ensure-tables");
    throw new Error(msg);
  }

  let stillMissing: string[];
  try {
    stillMissing = await getMissing();
  } catch (err) {
    const msg = `re-verify failed after recovery push: ${err}`;
    log(msg, "ensure-tables");
    throw new Error(msg);
  }

  if (stillMissing.length > 0) {
    const msg = `still missing after recovery push: ${stillMissing.join(", ")}`;
    log(msg, "ensure-tables");
    throw new Error(msg);
  }

  log("recovery successful — all critical tables now present", "ensure-tables");
}
