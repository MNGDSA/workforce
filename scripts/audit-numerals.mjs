#!/usr/bin/env node
/**
 * Numeral audit: fails CI if any source file contains
 *   - Arabic-Indic digits  ٠١٢٣٤٥٦٧٨٩  (U+0660–U+0669)
 *   - Eastern Arabic-Indic ۰۱۲۳۴۵۶۷۸۹  (U+06F0–U+06F9)
 *   - Arabic decimal sep   ٫            (U+066B)
 *   - Arabic thousands sep ٬            (U+066C)
 *
 * The project rule is Western numerals only across all locales.
 * Allow-list paths that legitimately reference these characters
 * (the format helper itself, this audit script, and translation
 * JSON examples that document the rule).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ROOTS = ["client/src", "server", "shared"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css"]);
const ALLOW = new Set([
  "client/src/lib/format.ts",
  "scripts/audit-numerals.mjs",
]);
const RX = /[\u0660-\u0669\u06F0-\u06F9\u066B\u066C]/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      walk(p, out);
    } else {
      if (EXTS.has(p.slice(p.lastIndexOf(".")))) out.push(p);
    }
  }
  return out;
}

const offenders = [];
for (const r of ROOTS) {
  const abs = join(ROOT, r);
  try { statSync(abs); } catch { continue; }
  for (const f of walk(abs)) {
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    if (ALLOW.has(rel)) continue;
    const text = readFileSync(f, "utf8");
    if (RX.test(text)) {
      const lines = text.split(/\r?\n/);
      const hits = [];
      lines.forEach((ln, i) => { if (RX.test(ln)) hits.push({ n: i + 1, ln: ln.slice(0, 200) }); });
      offenders.push({ file: rel, hits });
    }
  }
}

if (offenders.length === 0) {
  console.log("✓ numeral audit clean — Western digits only");
  process.exit(0);
}

console.error("✗ numeral audit FAILED — found Arabic-Indic digits / separators:");
for (const o of offenders) {
  console.error(`  ${o.file}`);
  for (const h of o.hits) console.error(`    L${h.n}: ${h.ln}`);
}
console.error(`\nUse formatNumber() / formatDate() helpers from client/src/lib/format.ts.`);
process.exit(1);
