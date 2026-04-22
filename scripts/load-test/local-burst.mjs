#!/usr/bin/env node
// Local burst load-test driver for the WORKFORCE signup flow.
//
//   Usage:  node scripts/load-test/local-burst.mjs --total 5000 --concurrency 100
//
//   Requires the server to be running with NODE_ENV=development and
//   LOAD_TEST_BYPASS_THROTTLE=1 (so the OTP/IP throttles short-circuit and the
//   /api/_dev/last-otp/:phone peek endpoint is reachable). The SMS gateway is
//   automatically bypassed in development — no real SMS will fire.
//
// Per virtual signup the driver runs the four real production routes:
//
//   1. POST /api/auth/otp/request   — generate + persist OTP + enqueue SMS
//   2. GET  /api/_dev/last-otp/:p   — fetch the plaintext code (dev-only)
//   3. POST /api/auth/otp/verify    — mark OTP verified, returns otpId
//   4. POST /api/auth/register      — atomic user+candidate creation in a tx
//
// Each phase has its own latency histogram; errors are recorded with the
// HTTP status + a sample of the response body so DB contention or schema
// problems are surfaced clearly.

import { performance } from "node:perf_hooks";

const args = parseArgs(process.argv.slice(2));
const TOTAL       = args.total       ?? 1000;
const CONCURRENCY = args.concurrency ?? 50;
const OFFSET      = args.offset      ?? 0;        // index of first synthetic
                                                   // user — bump between runs
                                                   // to avoid pool collisions
const BASE        = args.base        ?? "http://localhost:5000";
const PHONE_PREFIX = "057";              // 057XXXXXXX — synthetic test pool
const NID_PREFIX   = "2900";             // 2900XXXXXX — synthetic test pool
const PASSWORD     = "LoadTest@2026!";

if (TOTAL > 9_999_999) throw new Error("phone pool exhausted");
if (TOTAL > 999_999)   throw new Error("nid pool exhausted");

console.log(`[load] target=${BASE} total=${TOTAL} concurrency=${CONCURRENCY}`);
console.log(`[load] phone pool ${PHONE_PREFIX}0000000..${PHONE_PREFIX}${String(TOTAL - 1).padStart(7, "0")}`);
console.log(`[load] nid   pool ${NID_PREFIX}000000..${NID_PREFIX}${String(TOTAL - 1).padStart(6, "0")}`);

const runStart = Date.now();
const runTag = runStart.toString(36);            // unique-per-run suffix to
                                                  // avoid collisions across
                                                  // back-to-back invocations
const phases = ["otp_request", "otp_peek", "otp_verify", "register"];
const samples = Object.fromEntries(phases.map(p => [p, []]));
const errors  = Object.fromEntries(phases.map(p => [p, []]));
let completed = 0;
let succeeded = 0;

async function timed(phase, fn) {
  const t0 = performance.now();
  try {
    const r = await fn();
    samples[phase].push(performance.now() - t0);
    return r;
  } catch (err) {
    samples[phase].push(performance.now() - t0);
    if (errors[phase].length < 5) errors[phase].push(String(err?.message ?? err).slice(0, 200));
    throw err;
  }
}

async function http(method, path, body, opts = {}) {
  const ctrl = AbortSignal.timeout(opts.timeout ?? 30_000);
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: ctrl,
  });
  const txt = await res.text();
  let parsed = null;
  try { parsed = txt ? JSON.parse(txt) : null; } catch { parsed = { raw: txt }; }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status} ${(parsed?.message ?? txt).slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  return parsed;
}

// Build the ten-character national ID for synthetic candidate `i`.
// 2900XXXXXX — fits the 10-digit NID schema and is far from real PDPL IDs.
function makeNid(i)   { return NID_PREFIX   + String(OFFSET + i).padStart(6, "0"); }
function makePhone(i) { return PHONE_PREFIX + String(OFFSET + i).padStart(7, "0"); }
function makeName(i)  { return `LoadTest ${runTag}-${OFFSET + i}`; }

async function runOne(i) {
  const phone = makePhone(i);
  const nid   = makeNid(i);
  try {
    await timed("otp_request", () => http("POST", "/api/auth/otp/request", { phone }));
    const peek = await timed("otp_peek", () => http("GET", `/api/_dev/last-otp/${phone}`));
    if (!peek?.code) throw new Error("dev peek returned no code (gate closed?)");
    const v = await timed("otp_verify", () => http("POST", "/api/auth/otp/verify", { phone, code: peek.code }));
    if (!v?.otpId) throw new Error("verify returned no otpId");
    await timed("register", () => http("POST", "/api/auth/register", {
      fullName: makeName(i),
      phone,
      nationalId: nid,
      password: PASSWORD,
      otpId: v.otpId,
    }));
    succeeded++;
  } finally {
    completed++;
    if (completed % Math.max(50, Math.floor(TOTAL / 20)) === 0) {
      const elapsed = (Date.now() - runStart) / 1000;
      const rate = (completed / elapsed).toFixed(1);
      process.stdout.write(`  …${completed}/${TOTAL} done  ok=${succeeded}  rate=${rate} flows/s  elapsed=${elapsed.toFixed(1)}s\n`);
    }
  }
}

// Sliding-window worker pool — keeps exactly `CONCURRENCY` flows in flight at
// all times. setImmediate yield keeps the event loop responsive so progress
// logs interleave with worker progress.
async function worker(queue) {
  while (queue.length) {
    const i = queue.shift();
    if (i === undefined) return;
    try { await runOne(i); } catch { /* recorded in errors[phase] */ }
    await new Promise(setImmediate);
  }
}

const queue = Array.from({ length: TOTAL }, (_, i) => i);
const workers = Array.from({ length: CONCURRENCY }, () => worker(queue));

await Promise.all(workers);

// ─── Report ─────────────────────────────────────────────────────────────────
const totalElapsed = (Date.now() - runStart) / 1000;
const failed = TOTAL - succeeded;

function pct(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

console.log(`\n────────────────  RESULT  ────────────────`);
console.log(`  total flows attempted : ${TOTAL}`);
console.log(`  successful end-to-end : ${succeeded}  (${(100 * succeeded / TOTAL).toFixed(2)}%)`);
console.log(`  failed                : ${failed}`);
console.log(`  wall clock            : ${totalElapsed.toFixed(2)}s`);
console.log(`  throughput            : ${(succeeded / totalElapsed).toFixed(1)} signups/s end-to-end`);
console.log(`  raw HTTP req/s        : ${(TOTAL * 4 / totalElapsed).toFixed(1)} (4 calls per flow)`);
console.log(`\n  phase                       n        p50       p95       p99       max`);
for (const ph of phases) {
  const s = samples[ph];
  const row = `  ${ph.padEnd(24)}  ${String(s.length).padStart(6)}   ${pct(s, 50).toFixed(1).padStart(7)}ms ${pct(s, 95).toFixed(1).padStart(7)}ms ${pct(s, 99).toFixed(1).padStart(7)}ms ${pct(s, 100).toFixed(1).padStart(7)}ms`;
  console.log(row);
}
console.log("\n  error samples (max 5 per phase):");
for (const ph of phases) {
  if (errors[ph].length === 0) { console.log(`    ${ph}: (none)`); continue; }
  console.log(`    ${ph}:`);
  for (const e of errors[ph]) console.log(`      - ${e}`);
}
console.log("──────────────────────────────────────────\n");

process.exit(failed > 0 ? 2 : 0);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith("--")) {
      const key = k.slice(2);
      const v = argv[i + 1];
      if (v && !v.startsWith("--")) { out[key] = isNaN(+v) ? v : +v; i++; }
      else out[key] = true;
    }
  }
  return out;
}
