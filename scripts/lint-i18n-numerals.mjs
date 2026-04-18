#!/usr/bin/env node
/**
 * i18n numerals lint guard
 * ────────────────────────
 * Enforces the project's "Western Arabic numerals 0–9 everywhere" rule by
 * scanning source files for two classes of violations:
 *
 *   1. Eastern Arabic-Indic digits (U+0660–U+0669) and Extended Arabic-Indic
 *      digits (U+06F0–U+06F9) appearing in source code (string literals,
 *      identifiers, comments). These produce ٠١٢٣٤٥٦٧٨٩ at runtime which is
 *      forbidden by the project rule.
 *
 *   2. Locale-aware formatters that omit `numberingSystem: "latn"`:
 *        - new Intl.NumberFormat(...)
 *        - new Intl.DateTimeFormat(...)
 *        - new Intl.RelativeTimeFormat(...)
 *        - .toLocaleString(...) / .toLocaleDateString(...) / .toLocaleTimeString(...)
 *      When these run with an Arabic locale and no numbering-system override,
 *      Node/V8 produces Eastern digits silently — which is exactly the bug we
 *      want to prevent.
 *
 * To intentionally allow a line, append the comment:
 *     // i18n-numerals: allow
 *
 * Exit codes:
 *   0 — clean
 *   1 — at least one violation found
 *   2 — invalid invocation / IO error
 */

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();

const SCAN_DIRS = ["client/src", "server", "shared", "scripts"];
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// Files / paths that legitimately contain Eastern-digit text and must be
// excluded from the digit check. (Locale JSON files are pure data and never
// reach the formatter rule either.)
const SKIP_PATHS = [
  "node_modules",
  "dist",
  ".git",
  ".local",
  ".replit",
  // The locale catalogues themselves: Arabic copy is allowed to use any
  // glyphs *except* digits — but they are JSON, not source, so they are
  // excluded by the extension filter above. We still explicitly skip the
  // directory in case someone adds .ts catalogues later.
  "client/src/lib/i18n/locales",
  // The lint script itself contains the literal range it is detecting.
  "scripts/lint-i18n-numerals.mjs",
  // Earlier audit script, kept for reference; documents the very ranges it scans.
  "scripts/audit-numerals.mjs",
];

const ALLOW_COMMENT = /\/\/\s*i18n-numerals:\s*allow/;

// ─── Patterns ────────────────────────────────────────────────────────────────
const EASTERN_DIGIT_RE = /[\u0660-\u0669\u06F0-\u06F9]/;

// Anchor patterns — we capture only the call name + the opening paren, then
// balance parentheses ourselves to extract the full argument list (handles
// nested method calls like `locale.startsWith("ar")` inside the args, and
// arguments that span multiple lines).
const INTL_FORMATTER_ANCHOR_RE =
  /\bnew\s+Intl\.(?:NumberFormat|DateTimeFormat|RelativeTimeFormat|ListFormat)\s*\(/g;
const TO_LOCALE_ANCHOR_RE =
  /\.\s*toLocale(?:String|DateString|TimeString)\s*\(/g;

/** Given the full source string and the index just after `(`, return the
 *  substring up to the matching `)` (parens balanced, quotes respected),
 *  along with the line number on which the call started. */
function extractArgs(src, openIdx) {
  let depth = 1;
  let i = openIdx;
  let inStr = null;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === "'" || ch === '"' || ch === "`") inStr = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") { depth--; if (depth === 0) break; }
    }
    i++;
  }
  return src.slice(openIdx, i);
}

// Any explicit `numberingSystem:` key in the options object is accepted — if
// the developer is naming the option, they are aware of the rule. This avoids
// false positives when the value is a constant or imported reference (e.g.
// `numberingSystem: NUMBERING_SYSTEM`).
const NUMBERING_SYSTEM_LATN_RE = /\bnumberingSystem\s*:/;
// A formatter is also safe if (a) the locale tag already pins Latin digits via
// the BCP-47 unicode extension `-u-nu-latn`, or (b) the only locale literals
// in the call are English (which on every supported Node build resolves to
// Latin digits). We detect English-locale safety by requiring that *every*
// quoted string in the args starts with `en` and that no `ar` literal is
// present.
const NU_LATN_EXT_RE = /-u-(?:[a-z0-9]+-)*nu-latn\b/i;
function argsForceLatn(args) {
  if (NUMBERING_SYSTEM_LATN_RE.test(args)) return true;
  if (NU_LATN_EXT_RE.test(args)) return true;
  const literals = args.match(/["']([a-z]{2,3}(?:-[A-Za-z0-9]+)*)["']/g) ?? [];
  if (literals.length === 0) return false;
  let allEnglish = true;
  let hasArabic = false;
  for (const raw of literals) {
    const tag = raw.slice(1, -1).toLowerCase();
    if (tag.startsWith("ar")) hasArabic = true;
    if (!tag.startsWith("en") && !["default", "ucs2", "gsm7", "utc"].includes(tag)) allEnglish = false;
  }
  return allEnglish && !hasArabic;
}

// ─── Walk ────────────────────────────────────────────────────────────────────
function walk(dir, out) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (SKIP_PATHS.some((p) => rel === p || rel.startsWith(p + "/"))) continue;
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      walk(full, out);
    } else if (SCAN_EXTENSIONS.has(extname(name))) {
      out.push(full);
    }
  }
}

const files = [];
for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

// ─── Scan ────────────────────────────────────────────────────────────────────
const violations = [];

for (const file of files) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { continue; }
  const lines = src.split("\n");
  // Build line-start index map for quick offset → line number lookup.
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") lineStarts.push(i + 1);
  const offsetToLine = (off) => {
    // binary search
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };

  // Eastern-digit rule (line-by-line)
  for (let i = 0; i < lines.length; i++) {
    if (ALLOW_COMMENT.test(lines[i])) continue;
    if (EASTERN_DIGIT_RE.test(lines[i])) {
      violations.push({
        file: relative(ROOT, file),
        line: i + 1,
        rule: "eastern-digit",
        snippet: lines[i].trim(),
      });
    }
  }

  // Intl formatter rule (paren-balanced, multi-line)
  INTL_FORMATTER_ANCHOR_RE.lastIndex = 0;
  let m;
  while ((m = INTL_FORMATTER_ANCHOR_RE.exec(src)) !== null) {
    const lineNo = offsetToLine(m.index);
    if (ALLOW_COMMENT.test(lines[lineNo - 1])) continue;
    const args = extractArgs(src, m.index + m[0].length);
    if (!argsForceLatn(args)) {
      violations.push({
        file: relative(ROOT, file),
        line: lineNo,
        rule: "intl-no-latn",
        snippet: lines[lineNo - 1].trim(),
      });
    }
  }

  // toLocale*() rule (paren-balanced, multi-line)
  TO_LOCALE_ANCHOR_RE.lastIndex = 0;
  while ((m = TO_LOCALE_ANCHOR_RE.exec(src)) !== null) {
    const lineNo = offsetToLine(m.index);
    if (ALLOW_COMMENT.test(lines[lineNo - 1])) continue;
    const args = extractArgs(src, m.index + m[0].length);
    // A bare `.toLocaleString()` (no arguments) is permitted because Node
    // defaults to the host locale, which is Latin in our containers and in
    // CI. Calls that pass arguments must guarantee Latin digits.
    if (args.trim() === "") continue;
    if (!argsForceLatn(args)) {
      violations.push({
        file: relative(ROOT, file),
        line: lineNo,
        rule: "tolocale-no-latn",
        snippet: lines[lineNo - 1].trim(),
      });
    }
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log(`[lint:numerals] OK — scanned ${files.length} files, no violations.`);
  process.exit(0);
}

const RULE_LABEL = {
  "eastern-digit":   "Eastern Arabic-Indic digit literal (use 0–9)",
  "intl-no-latn":    "Intl formatter missing numberingSystem: 'latn'",
  "tolocale-no-latn":"toLocale*() options missing numberingSystem: 'latn'",
};

console.error(`[lint:numerals] FAIL — ${violations.length} violation(s) in ${files.length} file(s):\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  [${v.rule}] ${RULE_LABEL[v.rule]}`);
  console.error(`    ${v.snippet}`);
}
console.error(`\nFix the issues above, or append \`// i18n-numerals: allow\` to a line you intentionally need to keep.`);
process.exit(1);
