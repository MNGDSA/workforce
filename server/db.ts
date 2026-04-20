import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function getConnectionString(): string {
  const url = process.env.DATABASE_URL || "";
  return url.replace(/[?&]sslmode=[^&]*/, "").replace(/\?$/, "");
}

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: getConnectionString(),
  max: 40,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
