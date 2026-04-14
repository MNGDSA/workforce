import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("Running migration: candidate status 'active' → 'available'...");
  
  const result = await db.execute(
    sql`UPDATE candidates SET status = 'available', updated_at = NOW() WHERE status = 'active' RETURNING id`
  );
  
  const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows ?? [];
  console.log(`Migrated ${rows.length} candidate(s) from 'active' to 'available'.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
