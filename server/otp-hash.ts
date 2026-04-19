import crypto from "crypto";

const PEPPER =
  process.env.OTP_PEPPER ??
  process.env.SESSION_SECRET ??
  "dev-only-otp-pepper-do-not-use-in-prod";

if (process.env.NODE_ENV === "production" && !process.env.OTP_PEPPER && !process.env.SESSION_SECRET) {
  console.error(
    "[otp-hash] PRODUCTION started without OTP_PEPPER or SESSION_SECRET — OTP codes are effectively unsalted.",
  );
}

export function hashOtp(code: string): string {
  return crypto.createHmac("sha256", PEPPER).update(code).digest("hex");
}

export function verifyOtpHash(input: string, storedHash: string): boolean {
  const inputHash = hashOtp(input);
  if (inputHash.length !== storedHash.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(inputHash, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}
