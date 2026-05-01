/**
 * Task #252 — derived display status for candidates.
 *
 * The talent page used to show a confusing mix of raw enum values
 * (`available`, `inactive`, `pending_profile`, `awaiting_activation`)
 * and a display-only `archived` synthesised from the `archived_at`
 * timestamp. The product reality is much simpler: a candidate sits in
 * exactly one of five buckets at any moment in time.
 *
 *   - completed      — profile done, web-active in last 1 year
 *   - not_activated  — SMP worker, never logged in, ≤ 30 days old
 *   - hired          — converted to an employee (always overrides
 *                      every freshness check; an employed worker is
 *                      never auto-archived)
 *   - blocked        — manually blocked by an admin
 *   - archived       — everything else (stale, never-finished, manually
 *                      archived, etc.)
 *
 * This helper is the single source of truth. It is imported by both
 * the server (which projects the result into `getCandidates` rows and
 * uses it to translate the status filter into SQL) and the client
 * (which reads it back to render the badge). Server and client MUST
 * stay in agreement, hence the shared module.
 *
 * IMPORTANT: this never mutates a candidate row. The seven-value
 * `candidate_status` Postgres enum is unchanged. Display archival is
 * derived from raw signals (`profile_completed`, `last_login_at`,
 * `created_at`, `archived_at`, `classification`, `status`) at read
 * time only — fully reversible if a product rule changes later.
 *
 * NB: Mobile app activity is NOT a signal here. Only employees sign
 * into the Workforce mobile app, and an employee always carries
 * `status = 'hired'` on their candidate row, which short-circuits
 * the freshness check on rule (3) below. Candidates can only sign in
 * via the web portal, so `last_login_at` is the complete activity
 * signal for any row whose freshness actually matters.
 */

export const DISPLAY_STATUSES = [
  "completed",
  "not_activated",
  "hired",
  "blocked",
  "archived",
] as const;

export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

/**
 * Task #254 — sub-bucket reasons within Archived.
 *
 * Today every Archived row shows the same chip, even though admins
 * are looking at four very different cohorts:
 *
 *   - inactive_one_year   — finished profile but no web login >1y
 *                           (recoverable: send a re-engagement SMS)
 *   - incomplete_profile  — self-signup who never finished the wizard,
 *                           or SMP who logged in but never completed
 *                           profile (recoverable: re-engage)
 *   - missed_activation   — SMP worker whose 30-day activation window
 *                           passed without ever logging in
 *                           (recoverable: re-issue activation SMS)
 *   - manually_archived   — admin pressed Archive
 *                           (deliberate; no automatic affordance)
 *
 * The reason is computed at read time alongside `displayStatus` and
 * is `null` for any row whose `displayStatus` is not "archived".
 * Like `computeDisplayStatus`, this never mutates the candidate row
 * — the priority order below is fixed and the function is pure.
 *
 * Priority MUST match `computeDisplayStatus` rule order so a row
 * never lands in two different reasons. (1) manually archived wins
 * over derived reasons; (2) finished-but-stale wins over the
 * SMP-specific buckets because rule 4/5 in `computeDisplayStatus`
 * fires before rule 6/7.
 */
export const ARCHIVED_REASONS = [
  "inactive_one_year",
  "incomplete_profile",
  "missed_activation",
  "manually_archived",
] as const;

export type ArchivedReason = (typeof ARCHIVED_REASONS)[number];

/**
 * Minimal row shape needed to derive a display status. Kept to a
 * structural type (not the full Candidate type) so callers — including
 * tests, the export pipeline, and downstream services — can pass any
 * superset without coupling to Drizzle's row type.
 */
export interface CandidateForStatus {
  status: string | null | undefined;
  archivedAt: Date | string | null | undefined;
  profileCompleted: boolean | null | undefined;
  classification: "individual" | "smp" | string | null | undefined;
  lastLoginAt: Date | string | null | undefined;
  createdAt: Date | string | null | undefined;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Derive the five-value display status. Priority order is fixed and
 * documented below — the first matching rule wins. The function is
 * pure (no I/O, no globals) so the same `now` always produces the
 * same answer.
 */
export function computeDisplayStatus(
  c: CandidateForStatus,
  now: Date = new Date(),
): DisplayStatus {
  const nowMs = now.getTime();
  const lastLoginMs = toMs(c.lastLoginAt);
  const createdMs = toMs(c.createdAt);
  const archivedMs = toMs(c.archivedAt);

  // (1) Manually archived rows always read as Archived. Admin intent
  // beats every other signal.
  if (archivedMs !== null) return "archived";

  // (2) Blocked overrides freshness — a blocked candidate is still
  // visibly Blocked, not silently re-bucketed as Archived.
  if (c.status === "blocked") return "blocked";

  // (3) Hired overrides freshness too. This is the billability rule:
  // an employed worker can NEVER auto-archive based on web-portal
  // activity, because employees use the mobile app, not the candidate
  // web portal. Without this override their `last_login_at` would
  // typically be stale and they'd disappear from active listings —
  // which would erase the human being whose payroll is running.
  if (c.status === "hired") return "hired";

  const profileCompleted = c.profileCompleted === true;
  const isFreshLogin =
    lastLoginMs !== null && nowMs - lastLoginMs <= ONE_YEAR_MS;

  // (4) Profile done + recent login → Completed. The "happy path".
  if (profileCompleted && isFreshLogin) return "completed";

  // (5) Profile done but stale (or never-logged-in). Treat as Archived
  // — a finished profile sitting untouched for >1 year is dead weight
  // and shouldn't clutter active listings.
  if (profileCompleted) return "archived";

  // (6) Self-signup individual who never finished the wizard. The
  // wizard is the single gate to applying for jobs, so without it
  // they're inert — Archived.
  if (c.classification === "individual") return "archived";

  // (7) From here on we're in the SMP-classification branch. SMP
  // workers are bulk-uploaded by their parent company, so the
  // activation grace window is product-defined as 30 days from the
  // candidate row's creation.
  if (c.classification === "smp") {
    const createdRecently =
      createdMs !== null && nowMs - createdMs <= THIRTY_DAYS_MS;

    if (lastLoginMs === null && createdRecently) return "not_activated";
    if (lastLoginMs === null) return "archived"; // missed the 30-day window
    // Logged in but never finished the wizard. STRICT — no grace
    // period. Per product decision: an SMP worker who can sign in
    // but won't finish their profile is functionally equivalent to
    // someone who never showed up.
    return "archived";
  }

  // (8) Defensive default. Should be unreachable given the closed
  // classification enum, but guards us against a future enum value
  // arriving without a matching branch.
  return "archived";
}

/**
 * Task #254 — derive the sub-bucket reason for an Archived row.
 * Returns `null` if the row is not Archived (i.e. `displayStatus`
 * resolves to anything other than "archived"). The branch order
 * is locked to the same priority as `computeDisplayStatus` so the
 * two helpers never disagree on a single row.
 */
export function computeArchivedReason(
  c: CandidateForStatus,
  now: Date = new Date(),
): ArchivedReason | null {
  // Only Archived rows have a reason. Bail out for every other
  // bucket so the chip never renders next to a Completed/Hired/
  // Blocked/Not-Activated badge.
  if (computeDisplayStatus(c, now) !== "archived") return null;

  // (1) Manual archive wins. An admin pressed Archive — even on a
  // row that would otherwise have derived as inactive >1y or
  // missed-activation. Surface that explicitly so admins know not
  // to "fix" it with a re-engagement SMS.
  if (toMs(c.archivedAt) !== null) return "manually_archived";

  const nowMs = now.getTime();
  const lastLoginMs = toMs(c.lastLoginAt);
  const profileCompleted = c.profileCompleted === true;
  const isStaleLogin =
    lastLoginMs !== null && nowMs - lastLoginMs > ONE_YEAR_MS;

  // (2) Finished profile but stale login → inactive >1y. Mirrors
  // rule 5 of `computeDisplayStatus`. Recoverable via a re-engagement
  // SMS — they already have a working account.
  if (profileCompleted && isStaleLogin) return "inactive_one_year";

  // (3) Profile-completed without any recorded login at all is also
  // bucketed as "stale" — there was no recent activity to recover
  // them from, so the same re-engagement SMS applies.
  if (profileCompleted) return "inactive_one_year";

  // (4) SMP worker who never logged in within the 30-day grace
  // window → missed activation. Recoverable via the existing
  // activation-token reissue flow.
  if (
    c.classification === "smp" &&
    lastLoginMs === null
  ) {
    return "missed_activation";
  }

  // (5) Anything else with an incomplete profile — self-signup
  // individual who never finished the wizard, or an SMP worker who
  // signed in but never completed their profile.
  return "incomplete_profile";
}

/**
 * Postgres `CASE` expression that mirrors `computeDisplayStatus`
 * one-for-one. Used by the server's `getCandidates` to project the
 * derived status into each row and to translate the `?status=` filter
 * into a WHERE clause without breaking pagination/total counts.
 *
 * The expression intentionally omits any references to `NOW()` for
 * the timestamps it compares — both `last_login_at` and `created_at`
 * comparisons are written against `NOW()` in the SQL string itself,
 * so there is no parameter substitution and the planner can use the
 * existing indexes on `candidates(status)`, `candidates(archived_at)`,
 * etc.
 *
 * This is a string fragment intentionally — it's wrapped in a
 * Drizzle `sql\`...\`` template by the caller so the table alias is
 * resolved correctly. We don't import Drizzle here to keep this file
 * server/client-portable.
 */
export const DISPLAY_STATUS_SQL = `
  CASE
    WHEN candidates.archived_at IS NOT NULL THEN 'archived'
    WHEN candidates.status = 'blocked' THEN 'blocked'
    WHEN candidates.status = 'hired' THEN 'hired'
    -- INTERVAL '365 days' (NOT '1 year') so the boundary stays in
    -- lockstep with the TS helper's fixed 365×24h constant. Postgres'
    -- '1 year' is calendar-aware and would shift by ±1 day across
    -- leap-year boundaries, causing a row to bucket as 'completed' on
    -- the server while the client computes 'archived' (or vice versa).
    WHEN candidates.profile_completed = true
         AND candidates.last_login_at IS NOT NULL
         AND candidates.last_login_at >= NOW() - INTERVAL '365 days'
      THEN 'completed'
    WHEN candidates.profile_completed = true THEN 'archived'
    WHEN candidates.classification = 'individual' THEN 'archived'
    WHEN candidates.classification = 'smp'
         AND candidates.last_login_at IS NULL
         AND candidates.created_at >= NOW() - INTERVAL '30 days'
      THEN 'not_activated'
    WHEN candidates.classification = 'smp'
         AND candidates.last_login_at IS NULL
      THEN 'archived'
    WHEN candidates.classification = 'smp'
         AND candidates.last_login_at IS NOT NULL
         AND candidates.profile_completed = false
      THEN 'archived'
    ELSE 'archived'
  END
`;

/**
 * Task #254 — Postgres CASE expression that mirrors
 * `computeArchivedReason`. Returns `NULL` for any row whose
 * derived status is not "archived" so the SQL projection drops
 * straight onto a nullable text column. Branch order is locked
 * to the JS twin to keep server projection and client fallback
 * in agreement.
 *
 * Wrapped in `sql.raw` by the caller for the same reason as
 * DISPLAY_STATUS_SQL — static literal, no parameter slots, the
 * planner sees it as a plain CASE and can use the existing
 * single-column indexes.
 */
export const ARCHIVED_REASON_SQL = `
  CASE
    -- (1) Manual archive wins regardless of the derived status,
    -- so admins can distinguish "I archived this" from "the system
    -- archived this" before they decide whether to re-engage.
    WHEN candidates.archived_at IS NOT NULL THEN 'manually_archived'
    -- Every derived branch below MUST also exclude rows that the
    -- DISPLAY_STATUS_SQL would bucket as 'blocked' or 'hired'. The
    -- TS twin gets this for free (its first line bails out unless
    -- displayStatus === 'archived'), but the SQL has to repeat the
    -- exclusions on every branch — without them, a blocked row with
    -- a stale login would be projected as 'inactive_one_year' here
    -- while the TS helper would (correctly) return null, breaking
    -- parity. Each branch's WHEN here mirrors the corresponding
    -- branch in DISPLAY_STATUS_SQL with the additional blocked/hired
    -- guard up front.
    WHEN candidates.status NOT IN ('blocked', 'hired')
         AND candidates.profile_completed = true
         AND (
           candidates.last_login_at IS NULL
           OR candidates.last_login_at < NOW() - INTERVAL '365 days'
         )
      THEN 'inactive_one_year'
    WHEN candidates.status NOT IN ('blocked', 'hired')
         AND candidates.classification = 'individual'
         AND candidates.profile_completed = false
      THEN 'incomplete_profile'
    WHEN candidates.status NOT IN ('blocked', 'hired')
         AND candidates.classification = 'smp'
         AND candidates.last_login_at IS NULL
         AND candidates.created_at < NOW() - INTERVAL '30 days'
      THEN 'missed_activation'
    WHEN candidates.status NOT IN ('blocked', 'hired')
         AND candidates.classification = 'smp'
         AND candidates.last_login_at IS NOT NULL
         AND candidates.profile_completed = false
      THEN 'incomplete_profile'
    ELSE NULL
  END
`;
