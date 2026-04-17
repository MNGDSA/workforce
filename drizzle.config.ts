import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

function getConnectionString(): string {
  const url = process.env.DATABASE_URL || "";
  return url.replace(/[?&]sslmode=[^&]*/, "").replace(/\?$/, "");
}

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getConnectionString(),
    ssl: isProduction ? { rejectUnauthorized: false } : undefined,
  } as any,
  verbose: true,
  strict: false,
});
