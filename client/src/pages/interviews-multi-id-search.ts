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
 *   - candidate.nationalId or candidate.id (case-insensitive) is in the token
 *     set, OR
 *   - candidate.phone — compared by canonical 9-digit Saudi-mobile suffix so
 *     the same number pasted in any of `0XXXXXXXXX` / `+966XXXXXXXXX` /
 *     `966XXXXXXXXX` / `00966XXXXXXXXX` / `5XXXXXXXXX` matches the same
 *     invitee regardless of how it happens to be stored (Task #227)
 *   - free-text tokens (a typed name) never match in multi mode; that is by
 *     design, paste-a-list is an ID workflow
 *
 * Missing-IDs computation:
 *   - tokens that did not match any invitee are collected as `unmatched`
 *   - `missingIds` is the subset of `unmatched` that actually looks like an ID
 *     (`looksLikeId`); the remainder is counted in `droppedFreeText` so the UI
 *     can show "N non-ID entries were treated as free-text"
 *
 * Invitee scope (Task #227): the search never reaches into the global
 * candidates DB. Both `filterInvitees` and `computeInviteeSearchMeta` only
 * see the invitees passed in by the caller, which is the list of people
 * already invited to the interview (built upstream from job applications).
 */

import {
  type ParsedSearch,
  looksLikeId,
} from "@shared/candidate-search";
import { canonicalSaMobileSuffix } from "@shared/phone";

export type InviteeForSearch = {
  id: string;
  fullNameEn: string;
  nationalId: string | null;
  // Task #227 — present so phone-paste search can match invitees by phone
  // number. May be `null` for invitees who have no phone on file.
  phone: string | null;
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
 *   searches are nationalId+phone-substring only (dialog behaviour). Preserves
 *   the pre-task #226 behaviour of each surface so we don't broaden the dialog
 *   unintentionally; phone is added to both surfaces in #227.
 */
export function filterInvitees<T extends InviteeForSearch>(
  invitees: T[],
  parsed: ParsedSearch,
  singleTermMatchesName: boolean,
): T[] {
  if (parsed.tokens.length === 0) return invitees;

  if (parsed.isMulti) {
    const set = new Set(parsed.tokens.map((t) => t.toLowerCase()));
    // Pre-compute the set of canonical phone suffixes that appear in the
    // pasted tokens. Tokens that don't normalize to a Saudi mobile produce
    // `null` and contribute nothing to this set, so non-phone tokens cannot
    // accidentally match phones via this path.
    const phoneSuffixSet = new Set<string>();
    for (const tok of parsed.tokens) {
      const suffix = canonicalSaMobileSuffix(tok);
      if (suffix) phoneSuffixSet.add(suffix);
    }
    return invitees.filter((c) => {
      if (c.nationalId && set.has(c.nationalId.toLowerCase())) return true;
      if (set.has(c.id.toLowerCase())) return true;
      if (c.phone && phoneSuffixSet.size > 0) {
        const cSuffix = canonicalSaMobileSuffix(c.phone);
        if (cSuffix && phoneSuffixSet.has(cSuffix)) return true;
      }
      return false;
    });
  }

  // Single-token mode: preserve each surface's existing substring behaviour
  // for nationalId/name and add phone matching that's robust to formatting
  // drift. We use a *digits-only* substring (term + stored phone both stripped
  // to digits, with Arabic-Indic digits normalised) so that:
  //   - typing "55-08" or "+966 55" matches a stored "0550856257"
  //   - typing "0568691660" matches a stored "+966568691660"
  //   - typing "691660" still matches "0568691660" (existing behaviour)
  // ...and a canonical-suffix equality fallback so a fully-typed number in
  // any accepted format matches an invitee stored in any other accepted
  // format. Guard against empty `termDigits` so a name-only term doesn't
  // collapse to `""` and accidentally match every phone via `"".includes("")`.
  const term = parsed.tokens[0];
  const lower = term.toLowerCase();
  const termSuffix = canonicalSaMobileSuffix(term);
  const termDigits = digitsOnly(term);
  return invitees.filter((c) => {
    if (c.nationalId?.includes(term)) return true;
    if (singleTermMatchesName && c.fullNameEn.toLowerCase().includes(lower)) return true;
    if (c.phone) {
      if (termDigits.length > 0) {
        const phoneDigits = digitsOnly(c.phone);
        if (phoneDigits.includes(termDigits)) return true;
      }
      if (termSuffix) {
        const cSuffix = canonicalSaMobileSuffix(c.phone);
        if (cSuffix && cSuffix === termSuffix) return true;
      }
    }
    return false;
  });
}

/**
 * Strip everything that isn't a Western digit, after first folding the
 * Arabic-Indic / extended-Arabic-Indic digit blocks down to 0-9. Used by the
 * single-token phone substring so the input "+966 55 085 6257" compares the
 * same as "0550856257" — both reduce to the same digit run.
 */
function digitsOnly(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[^0-9]/g, "");
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
  // be pasted in either case so lower-case both sides. Phone numbers go in
  // by their canonical 9-digit suffix so the missing-list correctly recognises
  // a paste like `+966 55 085 6257` against an invitee stored as `0550856257`.
  const present = new Set<string>();
  for (const c of invitees) {
    if (c.nationalId) present.add(c.nationalId.toLowerCase());
    present.add(c.id.toLowerCase());
    if (c.phone) {
      const suffix = canonicalSaMobileSuffix(c.phone);
      if (suffix) present.add(suffix);
    }
  }

  const unmatched: string[] = [];
  for (const tok of parsed.tokens) {
    if (present.has(tok.toLowerCase())) continue;
    const tokSuffix = canonicalSaMobileSuffix(tok);
    if (tokSuffix && present.has(tokSuffix)) continue;
    // Preserve the user's original literal token so the chip text in the
    // missing panel reads exactly what they pasted, not the canonical form.
    unmatched.push(tok);
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
