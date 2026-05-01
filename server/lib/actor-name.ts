/**
 * Build the bilingual display name for a user record. Returns
 *   "Faisal Alamri فيصل العمري"  when both forms are present
 *   "Faisal Alamri"               when only English is present
 *   "فيصل العمري"                  when only Arabic is present
 *   username                      when neither name is present
 *   "Unknown"                     last-resort fallback
 *
 * Used for audit log actor names so that authenticated actions render
 * the actor's real bilingual identity instead of the literal "System"
 * placeholder. The combined string is rendered inside <bdi> on the
 * client so the mixed LTR/RTL display stays correct in both locales.
 *
 * Pure function with no I/O — safe to call from any request hot path.
 */
export function formatActorName(user: {
  fullName?: string | null;
  fullNameAr?: string | null;
  username?: string | null;
} | null | undefined): string {
  if (!user) return "Unknown";
  const en = user.fullName?.trim();
  const ar = user.fullNameAr?.trim();
  if (en && ar) return `${en} ${ar}`;
  if (en) return en;
  if (ar) return ar;
  return user.username?.trim() || "Unknown";
}
