/**
 * Event headcount — single source of truth.
 *
 * THE GOLDEN RULE
 * ───────────────
 * A workforce record counts as "filled" for an event when ALL of the
 * following are true:
 *
 *   1. workforce.event_id = <event>
 *   2. workforce.is_active = true
 *   3. workforce.offboarding_status IS NULL
 *      (workers in offboarding do NOT count)
 *   4. workforce.end_date IS NULL
 *      OR workforce.end_date >= CURRENT_DATE
 *      (back-dated terminations drop immediately;
 *       future-dated terminations keep counting until the date arrives)
 *
 * Start date is intentionally NOT part of the rule. The act of converting
 * a candidate to an employee on an event is the commitment that earns the
 * headcount — future-dated and missing start dates both count immediately.
 *
 * This rule lives here, in exactly one place. Every read site that needs
 * a filled count for an event MUST go through `countFilledForEvents` or
 * `countFilledForEvent`. Any PR that recomputes the rule inline should be
 * rejected.
 *
 * Task #64.
 */

import { sql, and, eq, isNull, or, inArray, count } from "drizzle-orm";
import { db } from "./db";
import { workforce } from "@shared/schema";

/**
 * Drizzle WHERE-clause fragment encoding the Golden Rule above.
 *
 * Pass the result to `.where(activeWorkforceFilter())` together with any
 * additional event-id filter, e.g.:
 *
 *   .where(and(eq(workforce.eventId, id), activeWorkforceFilter()))
 */
export function activeWorkforceFilter() {
  return and(
    eq(workforce.isActive, true),
    isNull(workforce.offboardingStatus),
    or(
      isNull(workforce.endDate),
      sql`${workforce.endDate}::date >= CURRENT_DATE`,
    ),
  );
}

/**
 * Count filled positions for a single event. Returns 0 when the event has
 * no qualifying workers.
 */
export async function countFilledForEvent(eventId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(workforce)
    .where(and(eq(workforce.eventId, eventId), activeWorkforceFilter()));
  return Number(row?.total ?? 0);
}

/**
 * Count filled positions across many events in a single query.
 * Returns a Map<eventId, count>. Events with zero filled positions are
 * absent from the map — call sites should default to 0.
 */
export async function countFilledForEvents(
  eventIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (eventIds.length === 0) return map;
  const rows = await db
    .select({ eventId: workforce.eventId, total: count() })
    .from(workforce)
    .where(and(inArray(workforce.eventId, eventIds), activeWorkforceFilter()))
    .groupBy(workforce.eventId);
  for (const r of rows) {
    if (r.eventId) map.set(r.eventId, Number(r.total));
  }
  return map;
}
