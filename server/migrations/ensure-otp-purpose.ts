import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time idempotent migration: ensures `otp_verifications.purpose`
 * exists. This column binds an OTP to its issuance flow so a code minted
 * for password reset can never satisfy a registration check, and vice
 * versa. Production deploys do not run drizzle-kit push automatically,
 * and any OTP issuance/verification crashes with
 * `column "purpose" does not exist` without this column.
 *
 * NOT NULL DEFAULT 'registration' is safe: existing rows backfill to
 * the original sole-purpose value (registration was the only flow before
 * this column existed) and the catalog-stored default keeps the ALTER
 * instant.
 */
export async function ensureOtpPurpose(
  log: (msg: string, source?: string) => void,
): Promise<void> {
  await db.execute(
    sql`ALTER TABLE otp_verifications
        ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'registration'`,
  );
  log("otp_verifications.purpose column ensured", "boot-migrate");
}
