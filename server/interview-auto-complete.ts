// Task — auto-mark elapsed interviews as `completed` (Google Calendar style).
//
// The recruiter UI (and the dashboard "scheduled interviews" tile) showed
// rows like "April 23 / April 24" sitting forever in the `scheduled`
// column long after the meeting ended, because nothing in the system ever
// flipped the status — the only writers are explicit recruiter actions
// (mark completed / cancelled / no-show / in-progress) plus the initial
// insert. Recruiters were treating the `scheduled` count as a backlog of
// real upcoming work, which it wasn't.
//
// Behavior locked with the user (Option A): the moment
// `now() >= scheduled_at + duration_minutes`, flip status
// `scheduled` → `completed`. We deliberately do NOT touch any other
// status (`in_progress`, `cancelled`, `no_show`, `completed`) — those
// represent explicit recruiter intent and must not be overwritten.
//
// The known trade-off (also locked with the user): if an interviewer
// silently no-showed and never updated the row, the system will still
// mark it `completed`. That matches the Google Calendar "events fade
// from upcoming once their end time passes" model and is the cost of
// not requiring a manual action on every meeting.
//
// Architecture:
//   • Pure SQL UPDATE — single statement, runs in O(rows-flipped) and
//     uses the existing (status, scheduled_at) indexes.
//   • Sweeper called both from a 60-second interval registered in
//     server/index.ts AND lazily from every interview-read path
//     (getInterviews, getInterviewDetail, getInterviewStats,
//     getDashboardStats), so a fresh-boot read never has to wait one
//     full minute to see the corrected state.
//   • Idempotent — re-running the sweep at any time is a no-op once the
//     elapsed rows have already been flipped, because the WHERE clause
//     scopes to status='scheduled'.

import { sql } from "drizzle-orm";
import { db } from "./db";
import { interviews } from "@shared/schema";

/**
 * Flip every interview whose scheduled end time
 * (`scheduled_at + duration_minutes` minutes) has passed and which is
 * still in `scheduled` status to `completed`. Returns the number of
 * rows flipped, primarily for logging and tests.
 *
 * Pure SQL — no per-row JS — so it stays cheap even with thousands of
 * historical interviews.
 */
export async function autoCompleteElapsedInterviews(): Promise<number> {
  const result = await db.execute(sql`
    UPDATE ${interviews}
    SET status = 'completed', updated_at = now()
    WHERE status = 'scheduled'
      AND scheduled_at + (duration_minutes * interval '1 minute') <= now()
  `);
  // pg driver: rowCount is on the result; some pool wrappers expose it as
  // .rowCount, others as .count. Coerce defensively.
  const anyResult = result as unknown as { rowCount?: number; count?: number };
  return anyResult.rowCount ?? anyResult.count ?? 0;
}

/**
 * setInterval-friendly wrapper. Logs the count + sweep duration when
 * non-zero so the scheduler surface in `[scheduler]` logs is
 * consistent with the other sweepers (auto-activate-events,
 * auto-close-events, candidate-age-out, etc.) without spamming a line
 * every minute when nothing changed. Duration is logged so we can
 * spot the sweep silently growing expensive on production volume
 * before it becomes a noisy-neighbour problem.
 */
export async function runInterviewAutoCompleteSweep(): Promise<void> {
  try {
    const startedAt = Date.now();
    const flipped = await autoCompleteElapsedInterviews();
    if (flipped > 0) {
      const elapsedMs = Date.now() - startedAt;
      console.log(`[scheduler] interview-auto-complete: flipped ${flipped} elapsed interview(s) to completed in ${elapsedMs}ms`);
    }
  } catch (err) {
    console.error("[scheduler] interview-auto-complete error:", err);
  }
}
