#!/usr/bin/env node
/**
 * Convert physical Tailwind class prefixes to logical (RTL-aware) ones.
 * Only matches inside `className="..."`, `className={'...'}`, `className={\`...\`}`,
 * `cn("...")`, `clsx("...")`, and `cva("...")` so we don't touch unrelated strings.
 *
 *   ml-X / ml-[…]      -> ms-X
 *   mr-X / mr-[…]      -> me-X
 *   pl-X / pl-[…]      -> ps-X
 *   pr-X / pr-[…]      -> pe-X
 *   text-left          -> text-start
 *   text-right         -> text-end
 *   border-l           -> border-s     (keeps -X / -color suffix if present)
 *   border-r           -> border-e
 *   rounded-l          -> rounded-s
 *   rounded-r          -> rounded-e
 *   left-X / left-[…]  -> start-X
 *   right-X / right-[…]-> end-X
 *
 * Variants like `md:`, `hover:`, `rtl:`, etc. are preserved.
 * Skips files that already opt out via `// codemod:skip` comment.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["client/src"];
const EXTS = new Set([".tsx", ".ts", ".jsx", ".js"]);

// Match a single Tailwind token (with possible variants prefix like md:hover:)
// then a directional class. Capture group 1 = leading variants (with trailing :),
// group 2 = the directional core, group 3 = optional suffix (number, [...] arbitrary, color, fraction, etc.).
const RULES = [
  // margin/padding (require something after the dash, otherwise we'd touch e.g. `md`)
  { rx: /\b((?:[a-z0-9]+:)*)ml-(\[[^\]]+\]|[\w./-]+)/g, to: (m, v, s) => `${v}ms-${s}` },
  { rx: /\b((?:[a-z0-9]+:)*)mr-(\[[^\]]+\]|[\w./-]+)/g, to: (m, v, s) => `${v}me-${s}` },
  { rx: /\b((?:[a-z0-9]+:)*)pl-(\[[^\]]+\]|[\w./-]+)/g, to: (m, v, s) => `${v}ps-${s}` },
  { rx: /\b((?:[a-z0-9]+:)*)pr-(\[[^\]]+\]|[\w./-]+)/g, to: (m, v, s) => `${v}pe-${s}` },
  // text alignment
  { rx: /\b((?:[a-z0-9]+:)*)text-left\b/g,  to: (m, v) => `${v}text-start` },
  { rx: /\b((?:[a-z0-9]+:)*)text-right\b/g, to: (m, v) => `${v}text-end` },
  // borders (border-l, border-l-X, border-l-color)
  { rx: /\b((?:[a-z0-9]+:)*)border-l(\b|-)/g, to: (m, v, sep) => `${v}border-s${sep === "-" ? "-" : ""}` },
  { rx: /\b((?:[a-z0-9]+:)*)border-r(\b|-)/g, to: (m, v, sep) => `${v}border-e${sep === "-" ? "-" : ""}` },
  // rounded
  { rx: /\b((?:[a-z0-9]+:)*)rounded-l(\b|-)/g, to: (m, v, sep) => `${v}rounded-s${sep === "-" ? "-" : ""}` },
  { rx: /\b((?:[a-z0-9]+:)*)rounded-r(\b|-)/g, to: (m, v, sep) => `${v}rounded-e${sep === "-" ? "-" : ""}` },
  // positional left/right (require value to avoid touching the word "left" elsewhere)
  { rx: /\b((?:[a-z0-9]+:)*)left-(\[[^\]]+\]|[\w./-]+)/g,  to: (m, v, s) => `${v}start-${s}` },
  { rx: /\b((?:[a-z0-9]+:)*)right-(\[[^\]]+\]|[\w./-]+)/g, to: (m, v, s) => `${v}end-${s}` },
];

// Only apply rules inside class-string contexts to avoid mangling code.
// We capture the quoted string body of the relevant attributes/calls.
const STRING_CONTEXTS = [
  // className="..." or className='...'
  /(\bclassName\s*=\s*)(["'])([\s\S]*?)\2/g,
  // className={`...`}  (template literal)
  /(\bclassName\s*=\s*\{)(`)([\s\S]*?)`\}/g,
  // class="..."  (rare, e.g. inside dangerouslySetInnerHTML strings)
  /(\bclass\s*=\s*)(["'])([\s\S]*?)\2/g,
  // cn("...", ...), clsx(...), cva(...) — match string args
  /(\b(?:cn|clsx|cva|tw|twMerge)\s*\(\s*)(["'`])([\s\S]*?)\2/g,
  // Multiple args – process each string argument: we'll iterate on raw string literals later
];

function transformClassString(s) {
  let out = s;
  for (const r of RULES) out = out.replace(r.rx, r.to);
  return out;
}

function transformFile(text) {
  let changed = false;
  let result = text;

  // 1. Quoted className / class attributes & cn/clsx/cva calls
  for (const ctx of STRING_CONTEXTS) {
    result = result.replace(ctx, (full, head, q, body) => {
      const next = transformClassString(body);
      if (next !== body) changed = true;
      return `${head}${q}${next}${q === "`" ? "`}" : q}`;
    });
  }

  // 2. Bare string literals inside cn/clsx/cva calls beyond first arg:
  //    Walk and replace any remaining string literals that look like class lists
  //    (heuristic: contains a Tailwind-ish token).  Limit to lines that already
  //    contain `cn(` / `clsx(` / `cva(` to be conservative.
  const looksLikeClasses = /(?:^|\s)(?:flex|grid|hidden|block|inline|absolute|relative|fixed|w-|h-|p-|m-|text-|bg-|border|rounded|gap-|items-|justify-|font-|hover:|focus:|md:|lg:|sm:|rtl:|ltr:)/;
  result = result.split("\n").map(line => {
    if (!/(?:\bcn\(|\bclsx\(|\bcva\()/.test(line)) return line;
    return line.replace(/(["'`])((?:\\\1|(?!\1).){2,}?)\1/g, (full, q, body) => {
      if (!looksLikeClasses.test(body)) return full;
      const next = transformClassString(body);
      if (next !== body) changed = true;
      return `${q}${next}${q}`;
    });
  }).join("\n");

  return { result, changed };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      walk(p, out);
    } else if (EXTS.has(p.slice(p.lastIndexOf(".")))) {
      out.push(p);
    }
  }
  return out;
}

const dryRun = process.argv.includes("--dry");
let touched = 0;

for (const r of TARGET_DIRS) {
  for (const f of walk(join(ROOT, r))) {
    const text = readFileSync(f, "utf8");
    if (text.includes("// codemod:skip")) continue;
    const { result, changed } = transformFile(text);
    if (changed) {
      touched++;
      const rel = relative(ROOT, f);
      if (dryRun) console.log(`would patch ${rel}`);
      else { writeFileSync(f, result); console.log(`patched ${rel}`); }
    }
  }
}

console.log(`\n${dryRun ? "Would patch" : "Patched"} ${touched} file(s).`);
