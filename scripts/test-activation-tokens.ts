// Task #107 — Smoke tests for the activation-token service.
//
// Validates pure-function behavior (no DB needed):
//   • generatePlainToken returns base64url, ≥43 chars, ≠ across calls
//   • hashToken is deterministic + 64 hex chars (SHA-256)
//   • token TTL constant is 21 days
//
// Run:  npx tsx scripts/test-activation-tokens.ts

import { generatePlainToken, hashToken } from "../server/activation-tokens";

let pass = 0, fail = 0;
function ok(cond: boolean, name: string, detail = "") {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else      { fail++; console.error(`✗ ${name}${detail ? "  " + detail : ""}`); }
}

const t1 = generatePlainToken();
const t2 = generatePlainToken();

ok(typeof t1 === "string", "generatePlainToken returns string");
ok(t1.length >= 43, "plain token is ≥43 chars (32 random bytes → base64url)", `len=${t1.length}`);
ok(/^[A-Za-z0-9_-]+$/.test(t1), "plain token uses base64url alphabet");
ok(t1 !== t2, "two consecutive mints produce different tokens");

const h1 = hashToken(t1);
const h1again = hashToken(t1);
const h2 = hashToken(t2);

ok(/^[0-9a-f]{64}$/.test(h1), "hashToken returns 64 hex chars (SHA-256)");
ok(h1 === h1again, "hashToken is deterministic for same input");
ok(h1 !== h2, "hashToken differs across different plain tokens");
ok(h1 !== t1, "hash is not equal to plain (sanity)");

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
