/**
 * Task #226 — multi-ID search helpers for the two interview invitee surfaces
 * (the side-sheet detail dialog on `/interviews` and the full-page invitee
 * list on `/interviews/:id/candidates`).
 *
 * These are kept as pure functions so the same logic powers both surfaces and
 * can be unit-tested without rendering React. The behaviour mirrors the
 * Candidates page (Task #195/#197) but the match runs entirely on the client
 * because the invitee list is already part of the interview-detail payload —
 * there is no server search endpoint to extend.
 *
 * Match rules (when `parsed.isMulti` is true):
 *   - candidate.nationalId or candidate.id (case-insensitive) is in the token set
 *   - free-text tokens (a typed name) never match in multi mode; that is by
 *     design, paste-a-list is an ID workflow
 *
 * Missing-IDs computation:
 *   - tokens that did not match any invitee are collected as `unmatched`
 *   - `missingIds` is the subset of `unmatched` that actually looks like an ID
 *     (`looksLikeId`); the remainder is counted in `droppedFreeText` so the UI
 *     can show "N non-ID entries were treated as free-text"
 */

import {
  type ParsedSearch,
  looksLikeId,
} from "@shared/candidate-search";

export type InviteeForSearch = {
  id: string;
  fullNameEn: string;
  nationalId: string | null;
};

export type InviteeSearchMeta = {
  tokenCount: number;
  truncated: boolean;
  missingIds: string[];
  droppedFreeText: number;
};

/**
 * Filter invitees according to the parsed search.
 *
 * @param singleTermMatchesName — when true, single-token searches also match
 *   the candidate's name (full-page behaviour). When false, single-token
 *   searches are nationalId-substring only (dialog behaviour). Preserves the
 *   pre-task #226 behaviour of each surface so we don't broaden the dialog
 *   unintentionally.
 */
export function filterInvitees<T extends InviteeForSearch>(
  invitees: T[],
  parsed: ParsedSearch,
  singleTermMatchesName: boolean,
): T[] {
  if (parsed.tokens.length === 0) return invitees;

  if (parsed.isMulti) {
    const set = new Set(parsed.tokens.map((t) => t.toLowerCase()));
    return invitees.filter((c) => {
      if (c.nationalId && set.has(c.nationalId.toLowerCase())) return true;
      if (set.has(c.id.toLowerCase())) return true;
      return false;
    });
  }

  // Single-token mode: preserve each surface's existing substring behaviour.
  const term = parsed.tokens[0];
  const lower = term.toLowerCase();
  return invitees.filter((c) => {
    if (c.nationalId?.includes(term)) return true;
    if (singleTermMatchesName && c.fullNameEn.toLowerCase().includes(lower)) return true;
    return false;
  });
}

/**
 * Compute the missing-IDs metadata for the panel above the list.
 * Returns `undefined` when not in multi-mode (no panel, no green line).
 */
export function computeInviteeSearchMeta<T extends InviteeForSearch>(
  invitees: T[],
  parsed: ParsedSearch,
): InviteeSearchMeta | undefined {
  if (!parsed.isMulti) return undefined;

  // Build the set of identifiers actually present on any invitee. We compare
  // tokens case-insensitively; numeric national IDs are unaffected, UUIDs may
  // be pasted in either case so lower-case both sides.
  const present = new Set<string>();
  for (const c of invitees) {
    if (c.nationalId) present.add(c.nationalId.toLowerCase());
    present.add(c.id.toLowerCase());
  }

  const unmatched: string[] = [];
  for (const tok of parsed.tokens) {
    if (!present.has(tok.toLowerCase())) unmatched.push(tok);
  }

  const missingIds = unmatched.filter(looksLikeId);
  const droppedFreeText = unmatched.length - missingIds.length;

  return {
    tokenCount: parsed.tokens.length,
    truncated: parsed.truncated,
    missingIds,
    droppedFreeText,
  };
}

/**
 * Slugify an interview name for use inside a CSV filename. Falls back to
 * `"session"` when the name is empty so we never produce
 * `missing_invitees__2026-04-29.csv`.
 */
export function slugifyForFilename(name: string | null | undefined, fallback = "session"): string {
  const base = (name ?? "").trim();
  if (!base) return fallback;
  // Keep ASCII alphanumerics, collapse everything else to "-", trim hyphens.
  // Arabic/Unicode characters are stripped; the date suffix and "missing_invitees_"
  // prefix keep the filename meaningful.
  const slug = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

/**
 * Build the CSV body for the missing-IDs download. One column "id", one row
 * per ID, RFC-4180 quoting (double-up embedded quotes).
 */
export function buildMissingIdsCsv(missingIds: string[]): string {
  return "id\n" + missingIds.map((id) => `"${id.replace(/"/g, '""')}"`).join("\n");
}

/**
 * Build the download filename: `missing_invitees_<slug>_<YYYY-MM-DD>.csv`.
 * Date is taken from the supplied `Date` (defaults to "now") in UTC so the
 * filename is stable across timezones.
 */
export function buildMissingIdsFilename(interviewName: string | null | undefined, now: Date = new Date()): string {
  const slug = slugifyForFilename(interviewName);
  const date = now.toISOString().slice(0, 10);
  return `missing_invitees_${slug}_${date}.csv`;
}
