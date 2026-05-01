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
