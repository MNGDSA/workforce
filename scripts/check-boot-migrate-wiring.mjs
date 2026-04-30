#!/usr/bin/env node
/**
 * Task #236 — Boot-migrate wiring check.
 *
 * Task #234 (`scripts/check-schema-migrations.mjs`) verifies that an
 * `ensure-*.ts` file exists and contains the right `ALTER TABLE ... IF NOT
 * EXISTS` statement. It does NOT verify that the exported function is
 * actually awaited from `server/index.ts` at boot. A contributor can write
 * a perfect ensure-script, ship it, and still crash production because the
 * import / await line was forgotten — this is the second-most-likely
 * failure mode of the boot-migrate pattern.
 *
 * For each `server/migrations/ensure-*.ts` file:
 *   1. Parse all `export async function ensureXxx` declarations.
 *   2. If at least one such export is awaited from a `// @boot-migrate-block`
 *      try/catch in `server/index.ts`, the script is considered wired.
 *   3. Otherwise the build fails — unless the file carries the opt-out
 *      marker `@boot-migrate-optional` somewhere in its source. Use that
 *      marker for ensure-scripts that are intentionally one-shot
 *      backfills (e.g. `migrate-to-rbac.ts` style) and not part of the
 *      every-boot self-heal.
 *
 * Why marker-based block extraction?
 *   The original brief asked us to inspect the boot-migrate try/catch at
 *   `server/index.ts:104-118` specifically. There are actually two such
 *   blocks today (the schema-patches block and the ensure-critical-tables
 *   safety net). Pinning by marker comment is robust to future refactors
 *   and prevents an `await ensureFoo(...)` in unrelated code (a future
 *   route handler, helper, or a string literal) from silently satisfying
 *   the wiring check.
 *
 * Run locally:  node scripts/check-boot-migrate-wiring.mjs
 * Runs in CI on every PR via `.github/workflows/test.yml`.
 *
 * See `server/migrations/README.md` for the boot-migrate convention.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Paths can be overridden via env vars for fixture-based testing
// (see server/__tests__/check-boot-migrate-wiring.test.ts). When unset, the
// real project paths are used.
const ensureDir =
  process.env.CHECK_ENSURE_DIR ?? path.join(projectRoot, "server", "migrations");
const indexPath =
  process.env.CHECK_INDEX_PATH ?? path.join(projectRoot, "server", "index.ts");

const BLOCK_MARKER = "@boot-migrate-block";
const OPT_OUT_MARKER = "@boot-migrate-optional";

if (!fs.existsSync(indexPath)) {
  console.error(
    `server/index.ts missing: ${path.relative(projectRoot, indexPath)}`,
  );
  process.exit(2);
}
if (!fs.existsSync(ensureDir)) {
  console.error(
    `ensure dir missing: ${path.relative(projectRoot, ensureDir)}`,
  );
  process.exit(2);
}

/**
 * Sanitize JS source for static scanning. The output is the SAME LENGTH
 * as the input so that character offsets discovered in the raw source
 * (e.g. the position of a `// @boot-migrate-block` marker comment) remain
 * valid in the sanitized source.
 *
 *   - Line and block comments → blanked to spaces (newlines are kept
 *     intact). Note: any markers searched for in comments must be
 *     located in the RAW source, not the sanitized one.
 *   - String / char / template-literal content → blanked to spaces, so a
 *     string such as `"await ensureFoo(log)"` does NOT match the await
 *     regex. The opening / closing quote characters are preserved so
 *     brace-matching stays balanced.
 *   - Template-literal `${...}` interpolation bodies are NOT blanked so
 *     an `await` inside `${ ... }` is still detected (rare, but correct).
 *
 * @param {string} src
 * @returns {string}
 */
function sanitizeForScan(src) {
  const out = src.split("");
  let i = 0;
  const blank = (start, end) => {
    for (let k = start; k < end && k < out.length; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };
  while (i < src.length) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === "/" && nx === "/") {
      const start = i;
      while (i < src.length && src[i] !== "\n") i++;
      blank(start, i);
      continue;
    }
    if (ch === "/" && nx === "*") {
      const start = i;
      i += 2;
      while (i < src.length - 1 && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(src.length, i + 2);
      blank(start, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++; // keep opening quote
      const contentStart = i;
      while (i < src.length) {
        if (src[i] === "\\") {
          i = Math.min(src.length, i + 2);
          continue;
        }
        if (src[i] === quote) break;
        i++;
      }
      blank(contentStart, i);
      if (i < src.length) i++; // skip closing quote
      continue;
    }
    if (ch === "`") {
      i++; // keep opening backtick
      while (i < src.length) {
        if (src[i] === "\\") {
          // Blank the escape sequence (e.g. \n inside a template).
          blank(i, Math.min(src.length, i + 2));
          i += 2;
          continue;
        }
        if (src[i] === "`") {
          i++; // skip closing backtick
          break;
        }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2; // skip `${` — its contents are real code.
          let depth = 1;
          while (i < src.length && depth > 0) {
            const c = src[i];
            if (c === "{") depth++;
            else if (c === "}") {
              depth--;
              if (depth === 0) {
                i++; // skip the closing `}`
                break;
              }
            }
            i++;
          }
          continue;
        }
        // Blank the raw template-literal text character.
        blank(i, i + 1);
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

/**
 * Walk forward from a `{` and return the index of the matching `}`.
 * Skips strings and comments via the same rules as `sanitizeForScan`.
 *
 * @param {string} src already-sanitized source
 * @param {number} openIdx index of the opening `{`
 * @returns {number} index of the matching `}`, or -1 if unbalanced
 */
function findMatchingBrace(src, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

const indexSrcRaw = fs.readFileSync(indexPath, "utf-8");
const indexSrc = sanitizeForScan(indexSrcRaw);

// Find every `// @boot-migrate-block` marker. The marker lives inside a
// line comment, so we must search the RAW source (the sanitizer blanks
// comment bodies). The sanitizer is length-preserving, so the marker's
// raw offset is also a valid offset in the sanitized source — we use the
// sanitized source from there on so that `try`, `{`, `}` finding can't
// be fooled by tokens hiding in strings or comments.
/** @type {string[]} */
const bootMigrateBodies = [];
let cursor = 0;
while (true) {
  const markerIdx = indexSrcRaw.indexOf(BLOCK_MARKER, cursor);
  if (markerIdx === -1) break;
  // The marker MUST sit inside a line comment so it never gets parsed as
  // code. Confirm the previous non-newline characters on the line are
  // `//`. This rejects accidental matches in identifiers / strings.
  let lineStart = markerIdx;
  while (lineStart > 0 && indexSrcRaw[lineStart - 1] !== "\n") lineStart--;
  const linePrefix = indexSrcRaw.slice(lineStart, markerIdx);
  if (!linePrefix.includes("//")) {
    cursor = markerIdx + BLOCK_MARKER.length;
    continue;
  }
  // From the marker, scan forward in the SANITIZED source for the next
  // `try` keyword. The sanitizer guarantees `try` cannot appear inside
  // strings or comments here.
  const reTry = /\btry\b/g;
  reTry.lastIndex = markerIdx;
  const tm = reTry.exec(indexSrc);
  if (tm === null) {
    cursor = markerIdx + BLOCK_MARKER.length;
    continue;
  }
  const tryIdx = tm.index;
  const braceIdx = indexSrc.indexOf("{", tryIdx);
  if (braceIdx === -1) {
    cursor = markerIdx + BLOCK_MARKER.length;
    continue;
  }
  const closeIdx = findMatchingBrace(indexSrc, braceIdx);
  if (closeIdx === -1) {
    console.error(
      `Unbalanced try block following @boot-migrate-block marker at ` +
        `offset ${markerIdx} in server/index.ts.`,
    );
    process.exit(2);
  }
  bootMigrateBodies.push(indexSrc.slice(braceIdx + 1, closeIdx));
  cursor = closeIdx + 1;
}

if (bootMigrateBodies.length === 0) {
  console.error(
    `No \`// ${BLOCK_MARKER}\` marker found in ${path.relative(projectRoot, indexPath)}.\n` +
      `Add the marker comment immediately above each boot-migrate try { ... } catch block, e.g.:\n` +
      `\n  // @boot-migrate-block — see scripts/check-boot-migrate-wiring.mjs\n  try {\n    const { ensureFoo } = await import("./migrations/ensure-foo");\n    await ensureFoo(log);\n  } catch (err) { ... }\n`,
  );
  process.exit(1);
}

// Collect every `await fnName(...)` invocation inside the marked blocks.
const awaitedFns = new Set();
const reAwaitCall = /\bawait\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
for (const body of bootMigrateBodies) {
  let am;
  reAwaitCall.lastIndex = 0;
  while ((am = reAwaitCall.exec(body)) !== null) {
    awaitedFns.add(am[1]);
  }
}

const ensureFiles = fs
  .readdirSync(ensureDir)
  .filter((f) => /^ensure-.*\.ts$/.test(f));

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const skipped = [];

for (const f of ensureFiles) {
  const src = fs.readFileSync(path.join(ensureDir, f), "utf-8");
  if (src.includes(OPT_OUT_MARKER)) {
    skipped.push(f);
    continue;
  }
  const reExport =
    /export\s+async\s+function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  /** @type {string[]} */
  const fns = [];
  let em;
  while ((em = reExport.exec(src)) !== null) fns.push(em[1]);
  if (fns.length === 0) {
    errors.push(
      `${f}: no \`export async function\` declaration found. Boot-migrate ` +
        `ensure scripts must export at least one async function (or carry ` +
        `the \`${OPT_OUT_MARKER}\` marker if intentionally one-shot).`,
    );
    continue;
  }

  const wired = fns.some((fn) => awaitedFns.has(fn));
  if (!wired) {
    const moduleId = f.replace(/\.ts$/, "");
    errors.push(
      `${f}: none of [${fns.join(", ")}] is awaited from a ` +
        `\`// ${BLOCK_MARKER}\` try/catch in server/index.ts. Add\n` +
        `      const { ${fns[0]} } = await import("./migrations/${moduleId}");\n` +
        `      await ${fns[0]}(log);\n` +
        `    inside a \`// ${BLOCK_MARKER}\` block in server/index.ts, or ` +
        `mark the file with \`${OPT_OUT_MARKER}\` if it is intentionally one-shot.`,
    );
  }
}

if (errors.length > 0) {
  console.error("Boot-migrate wiring check FAILED:\n");
  for (const e of errors) console.error("  ✗ " + e);
  console.error(
    `\n${errors.length} unwired ensure-script(s).\n\n` +
      `Background: Task #234 verifies that ensure-*.ts files exist with the\n` +
      `correct ALTER TABLE statement, but it does not verify that the\n` +
      `exported function is actually called at boot. A wired-but-unregistered\n` +
      `ensure-script will still crash production with\n` +
      `\`column "..." does not exist\` on the next deploy.\n` +
      `See server/migrations/README.md for the convention.`,
  );
  process.exit(1);
}

console.log(
  `Boot-migrate wiring OK — ${ensureFiles.length} ensure-script(s) checked ` +
    `(${ensureFiles.length - skipped.length} wired, ${skipped.length} opt-out) ` +
    `against ${bootMigrateBodies.length} \`${BLOCK_MARKER}\` block(s).`,
);
