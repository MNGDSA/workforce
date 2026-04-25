/**
 * Task #195 — multi-token search parser shared by client and server.
 *
 * Goal: HR pastes a list of identifiers (national IDs, UUIDs, phone
 * numbers, employee numbers) into the candidate search box. The parser
 * splits the paste into individual tokens using the separators that
 * Excel-column-copy / WhatsApp-paste / chat-paste actually produce.
 *
 * The parser is symmetric on both sides so the front-end "Searching N
 * IDs" pill agrees exactly with the back-end's tokenisation.
 */

export const MAX_SEARCH_TOKENS = 200;

// Newline, comma, semicolon, tab, or two-or-more whitespace characters
// each split a paste into tokens. A single space inside a token (e.g.
// "Mohammed Al Fares") is preserved so name searches keep working.
const SEPARATOR_REGEX = /[\n\r,;\t]+|\s{2,}/;

export type ParsedSearch = {
  tokens: string[];
  truncated: boolean;
  isMulti: boolean;
};

export function parseSearchTokens(raw: string | undefined | null): ParsedSearch {
  if (!raw || !raw.trim()) {
    return { tokens: [], truncated: false, isMulti: false };
  }
  const trimmed = raw.trim();

  // Single-token paste with no separators: behave exactly like today.
  if (!SEPARATOR_REGEX.test(trimmed)) {
    return { tokens: [trimmed], truncated: false, isMulti: false };
  }

  const split = trimmed.split(SEPARATOR_REGEX);
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const piece of split) {
    // Trim whitespace and strip surrounding quote characters that
    // sometimes wrap copied IDs (e.g. CSV exports quoting numerics).
    const t = piece.trim().replace(/^['"`]+|['"`]+$/g, "").trim();
    if (!t) continue;
    // Numeric tokens dedupe case-sensitive (digits already canonical);
    // text tokens dedupe case-insensitively.
    const dedupeKey = /^\d+$/.test(t) ? t : t.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    cleaned.push(t);
  }

  const truncated = cleaned.length > MAX_SEARCH_TOKENS;
  const tokens = cleaned.slice(0, MAX_SEARCH_TOKENS);
  return { tokens, truncated, isMulti: tokens.length > 1 };
}

/**
 * Returns true if a token "looks like" an identifier worth chasing
 * for outreach — long enough to be unique, mostly digits, or a UUID.
 *
 * Free-text tokens like "Mohammed" or "Riyadh" are excluded from the
 * unmatched-IDs panel because they were almost certainly typed for
 * fuzzy match, not for ID lookup.
 */
export function looksLikeId(token: string): boolean {
  if (!token || token.length < 6) return false;
  if (/^\d+$/.test(token)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return true;
  const digits = (token.match(/\d/g) ?? []).length;
  return digits / token.length >= 0.6;
}

export type CandidateSearchMeta = {
  tokenCount: number;
  truncated: boolean;
  missingIds: string[];
  droppedFreeText: number;
};
