// Individual track — production scale Monte Carlo simulation.
//
// Models the load characteristics of the Individual signup pipeline
// at 10,000 candidates and the Talent-page admin browse load that
// follows. Outputs:
//   1. Signup-arrival queueing simulation (M/M/c with finite pool).
//   2. Talent-page list-query latency simulation under concurrent
//      admin browsing.
//   3. OTP-throttle saturation analysis (per-IP and per-phone caps).
//
// All distributions and capacities are sourced from real numbers in
// the codebase:
//   - DB pool size = 20  (server/db.ts:16)
//   - OTP per-phone cap = 3 / 10min  (server/routes.ts:991)
//   - OTP per-IP cap = 20 / 10min, 30min lockout  (server/otp-throttle.ts:11)
//   - Talent-page page size = 100 default, 1000 max  (server/storage.ts)
//   - Multer upload limit = 5 MB  (server/routes.ts:178)
//
// Run:
//   npx tsx scripts/individual-signup-scale.ts
//   npx tsx scripts/individual-signup-scale.ts --candidates 10000 --hours 4
//   npx tsx scripts/individual-signup-scale.ts --candidates 10000 --hours 1 --seed 7
//
// Caveat: synthetic per-request latency distributions are calibrated
// from typical Express+Postgres+bcrypt characteristics, NOT from
// production traces. Real-traffic measurement against staging is a
// prerequisite of any go/no-go decision. The relative comparisons
// (which scenario saturates the pool first; how much headroom the
// throttle provides) are robust to the absolute calibration.

interface SimInputs {
  candidates: number;
  hours: number;
  poolSize: number;
  // Per-request latency distribution (lognormal, ms).
  signupMeanMs: number;
  signupSdMs: number;
  talentListMeanMs: number;
  talentListSdMs: number;
  // Admin browsing concurrency.
  concurrentAdmins: number;
  pageRequestsPerAdminPerMin: number;
  seed: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: () => number, mean: number, sd: number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function lognormal(rng: () => number, meanMs: number, sdMs: number): number {
  // Convert mean / sd to underlying normal parameters.
  const variance = sdMs * sdMs;
  const mu = Math.log((meanMs * meanMs) / Math.sqrt(variance + meanMs * meanMs));
  const sigma = Math.sqrt(Math.log(1 + variance / (meanMs * meanMs)));
  return Math.exp(normal(rng, mu, sigma));
}

function exponential(rng: () => number, meanMs: number): number {
  return -Math.log(1 - rng()) * meanMs;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[i];
}

interface SimRequest {
  arrivalMs: number;
  serviceMs: number;
}

interface PoolResult {
  scenario: string;
  totalRequests: number;
  arrivalsPerSec: number;
  meanWaitMs: number;
  p50WaitMs: number;
  p95WaitMs: number;
  p99WaitMs: number;
  meanResponseMs: number;
  p95ResponseMs: number;
  p99ResponseMs: number;
  timeoutCount: number;     // requests that waited > 2000ms (pool connection timeout)
  timeoutRate: number;
  poolUtilization: number;
}

// Discrete-event sim of an M/G/c queue with c = poolSize. Each
// arriving request grabs a connection if free, otherwise waits in
// FIFO. If wait > 2000ms (connection timeout) the request is
// counted as timed out and proceeds (we still simulate its service
// for accounting; in production it would 500). This mirrors the pg
// pool behavior in server/db.ts.
function simulatePool(scenario: string, requests: SimRequest[], poolSize: number): PoolResult {
  const sorted = [...requests].sort((a, b) => a.arrivalMs - b.arrivalMs);
  const connFreeAt: number[] = new Array(poolSize).fill(0);

  const waits: number[] = [];
  const responses: number[] = [];
  let timeouts = 0;
  let totalBusyMs = 0;
  let lastArrivalMs = 0;

  for (const req of sorted) {
    // Find earliest-free connection.
    let earliestIdx = 0;
    for (let i = 1; i < poolSize; i++) {
      if (connFreeAt[i] < connFreeAt[earliestIdx]) earliestIdx = i;
    }
    const startMs = Math.max(req.arrivalMs, connFreeAt[earliestIdx]);
    const wait = startMs - req.arrivalMs;
    if (wait > 2000) timeouts++;
    waits.push(wait);
    responses.push(wait + req.serviceMs);
    connFreeAt[earliestIdx] = startMs + req.serviceMs;
    totalBusyMs += req.serviceMs;
    lastArrivalMs = Math.max(lastArrivalMs, req.arrivalMs);
  }

  waits.sort((a, b) => a - b);
  responses.sort((a, b) => a - b);
  const windowMs = Math.max(...connFreeAt) - sorted[0].arrivalMs;
  const arrivalSpanSec = (lastArrivalMs - sorted[0].arrivalMs) / 1000;

  return {
    scenario,
    totalRequests: sorted.length,
    arrivalsPerSec: arrivalSpanSec > 0 ? sorted.length / arrivalSpanSec : 0,
    meanWaitMs: waits.reduce((a, b) => a + b, 0) / waits.length,
    p50WaitMs: quantile(waits, 0.50),
    p95WaitMs: quantile(waits, 0.95),
    p99WaitMs: quantile(waits, 0.99),
    meanResponseMs: responses.reduce((a, b) => a + b, 0) / responses.length,
    p95ResponseMs: quantile(responses, 0.95),
    p99ResponseMs: quantile(responses, 0.99),
    timeoutCount: timeouts,
    timeoutRate: timeouts / sorted.length,
    poolUtilization: windowMs > 0 ? totalBusyMs / (poolSize * windowMs) : 0,
  };
}

function generateSignupArrivals(sim: SimInputs, rng: () => number): SimRequest[] {
  // Surge profile: arrivals concentrated in the first hour after
  // launch, then tapering. We use a bell curve over the window.
  const totalMs = sim.hours * 3600 * 1000;
  const requests: SimRequest[] = [];

  for (let i = 0; i < sim.candidates; i++) {
    // Bell-curve arrival time: peak at 25% through the window.
    const u = rng();
    const v = rng();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    let frac = 0.25 + z * 0.15;
    frac = Math.max(0, Math.min(1, frac));
    const arrivalMs = frac * totalMs;
    const serviceMs = Math.max(50, lognormal(rng, sim.signupMeanMs, sim.signupSdMs));
    requests.push({ arrivalMs, serviceMs });
  }

  return requests;
}

function generateTalentBrowseArrivals(sim: SimInputs, rng: () => number, totalMs: number): SimRequest[] {
  const requests: SimRequest[] = [];
  // Each admin generates `pageRequestsPerAdminPerMin` requests
  // throughout the window with Poisson arrivals.
  const meanIntervalMs = 60_000 / sim.pageRequestsPerAdminPerMin;
  for (let admin = 0; admin < sim.concurrentAdmins; admin++) {
    let t = rng() * meanIntervalMs;
    while (t < totalMs) {
      requests.push({
        arrivalMs: t,
        serviceMs: Math.max(20, lognormal(rng, sim.talentListMeanMs, sim.talentListSdMs)),
      });
      t += exponential(rng, meanIntervalMs);
    }
  }
  return requests;
}

interface OtpThrottleAnalysis {
  candidatesPerIp: number;
  perIpCapacityPer10Min: number;
  capacityHeadroom: number;
  perPhoneCap: number;
  perPhoneCapWindowMin: number;
  // Suppose attackers / curious users retry; how many phones can a
  // single IP burn through their per-phone cap on?
  ipCapPhonesPer10Min: number;
}

function analyzeOtpThrottle(sim: SimInputs): OtpThrottleAnalysis {
  // Assume residential NAT: 50 candidates per IP (a worst-case-but-
  // plausible shared connection at a labor-camp WiFi).
  const candidatesPerIp = 50;
  const perIpCap = 20; // per 10 minutes
  const totalIpRequests = sim.candidates / candidatesPerIp;
  const tenMinWindows = (sim.hours * 60) / 10;
  const perIpCapacityPer10Min = perIpCap;
  const requiredPerIpPer10Min = totalIpRequests / tenMinWindows;
  const headroom = perIpCapacityPer10Min - requiredPerIpPer10Min;

  return {
    candidatesPerIp,
    perIpCapacityPer10Min,
    capacityHeadroom: headroom,
    perPhoneCap: 3,
    perPhoneCapWindowMin: 10,
    ipCapPhonesPer10Min: perIpCap,
  };
}

function parseArgs(argv: string[]): SimInputs {
  const get = (k: string, fb: number): number => {
    const idx = argv.indexOf(`--${k}`);
    if (idx >= 0 && idx + 1 < argv.length) {
      const v = Number(argv[idx + 1]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return fb;
  };
  return {
    candidates: get("candidates", 10000),
    hours: get("hours", 4),
    poolSize: get("pool-size", 20),
    // Signup is OTP-request + OTP-verify + register. Register does
    // bcrypt hashing (~80–150ms) + 2 INSERT roundtrips. OTP-request
    // does 1 INSERT + 1 outbound HTTPS call (synchronous in the
    // current impl). Median ~250ms is generous.
    signupMeanMs: get("signup-mean-ms", 250),
    signupSdMs: get("signup-sd-ms", 150),
    // Talent list query at 10k rows with one filter + composite
    // index hit + 4 correlated count subqueries. Calibrated to a
    // realistic Postgres latency band.
    talentListMeanMs: get("talent-mean-ms", 120),
    talentListSdMs: get("talent-sd-ms", 80),
    concurrentAdmins: get("admins", 5),
    pageRequestsPerAdminPerMin: get("admin-rpm", 6),
    seed: get("seed", 1234),
  };
}

function fmtMs(n: number): string {
  if (n < 1) return "<1ms";
  return `${n.toFixed(0)}ms`;
}
function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function printPoolResult(r: PoolResult): void {
  console.log(`  Scenario:               ${r.scenario}`);
  console.log(`  Requests:               ${r.totalRequests.toLocaleString()}`);
  console.log(`  Mean arrival rate:      ${r.arrivalsPerSec.toFixed(2)} req/sec`);
  console.log(`  Pool utilization:       ${fmtPct(r.poolUtilization)}`);
  console.log(`  Wait time   (mean):     ${fmtMs(r.meanWaitMs)}`);
  console.log(`  Wait time   (p50):      ${fmtMs(r.p50WaitMs)}`);
  console.log(`  Wait time   (p95):      ${fmtMs(r.p95WaitMs)}`);
  console.log(`  Wait time   (p99):      ${fmtMs(r.p99WaitMs)}`);
  console.log(`  Response    (mean):     ${fmtMs(r.meanResponseMs)}`);
  console.log(`  Response    (p95):      ${fmtMs(r.p95ResponseMs)}`);
  console.log(`  Response    (p99):      ${fmtMs(r.p99ResponseMs)}`);
  console.log(`  Pool timeouts (>2s wait): ${r.timeoutCount.toLocaleString()} (${fmtPct(r.timeoutRate)})`);
}

function main() {
  const sim = parseArgs(process.argv.slice(2));
  const rng = mulberry32(sim.seed);

  console.log("=".repeat(80));
  console.log("Individual track — production scale Monte Carlo simulation");
  console.log("=".repeat(80));
  console.log(`Candidates simulated:       ${sim.candidates.toLocaleString()}`);
  console.log(`Surge window:               ${sim.hours} hour(s)`);
  console.log(`DB pool size:               ${sim.poolSize}`);
  console.log(`Concurrent admins browsing: ${sim.concurrentAdmins}`);
  console.log(`Admin requests/min:         ${sim.pageRequestsPerAdminPerMin}`);
  console.log(`Seed:                       ${sim.seed}`);
  console.log("");

  // ─── Scenario 1: signups only ──────────────────────────────────────
  console.log("─".repeat(80));
  console.log("Scenario 1 — signup surge only (no admin browsing).");
  console.log("─".repeat(80));
  const signupArrivals = generateSignupArrivals(sim, rng);
  const r1 = simulatePool("Signup arrivals only", signupArrivals, sim.poolSize);
  printPoolResult(r1);

  // ─── Scenario 2: signups + concurrent admin browsing ───────────────
  console.log("");
  console.log("─".repeat(80));
  console.log("Scenario 2 — signup surge + concurrent admin browsing of Talent page.");
  console.log("─".repeat(80));
  const totalMs = sim.hours * 3600 * 1000;
  const browseArrivals = generateTalentBrowseArrivals(sim, rng, totalMs);
  const combined: SimRequest[] = [...signupArrivals, ...browseArrivals];
  const r2 = simulatePool("Signups + admin browse", combined, sim.poolSize);
  printPoolResult(r2);

  // ─── Scenario 3: 2x candidate volume (Hajj surge) ──────────────────
  console.log("");
  console.log("─".repeat(80));
  console.log("Scenario 3 — 2× candidate volume (Hajj seasonal surge stress test).");
  console.log("─".repeat(80));
  const surgeRng = mulberry32(sim.seed + 1);
  const surgeSim: SimInputs = { ...sim, candidates: sim.candidates * 2 };
  const surgeArrivals = generateSignupArrivals(surgeSim, surgeRng);
  const r3 = simulatePool("2× candidate surge", surgeArrivals, sim.poolSize);
  printPoolResult(r3);

  // ─── OTP throttle analysis ─────────────────────────────────────────
  console.log("");
  console.log("─".repeat(80));
  console.log("OTP throttle saturation (assumes 50 candidates per shared NAT IP).");
  console.log("─".repeat(80));
  const otp = analyzeOtpThrottle(sim);
  console.log(`  Per-IP cap (10min):       ${otp.perIpCapacityPer10Min} OTP requests`);
  console.log(`  Required per-IP (10min):  ${(sim.candidates / otp.candidatesPerIp / ((sim.hours * 60) / 10)).toFixed(1)}`);
  console.log(`  Headroom:                 ${otp.capacityHeadroom.toFixed(1)} req per 10min per IP`);
  console.log(`  Per-phone cap:            ${otp.perPhoneCap} OTP requests per ${otp.perPhoneCapWindowMin} min`);
  console.log(`  Verdict:                  ${otp.capacityHeadroom > 0 ? "PASS — IP cap accommodates load" : "FAIL — IP cap saturates"}`);

  // ─── Verdict ───────────────────────────────────────────────────────
  console.log("");
  console.log("=".repeat(80));
  console.log("Production readiness verdict for 10k Individual signups");
  console.log("=".repeat(80));
  const worstP99 = Math.max(r1.p99ResponseMs, r2.p99ResponseMs, r3.p99ResponseMs);
  const worstTimeout = Math.max(r1.timeoutRate, r2.timeoutRate, r3.timeoutRate);
  const verdict =
    worstTimeout < 0.001 && worstP99 < 5000
      ? "PASS"
      : worstTimeout < 0.01 && worstP99 < 10000
      ? "PASS WITH CAVEATS"
      : "FAIL";
  console.log(`  Worst-case p99 response:  ${fmtMs(worstP99)}`);
  console.log(`  Worst-case timeout rate:  ${fmtPct(worstTimeout)}`);
  console.log(`  Verdict:                  ${verdict}`);
  console.log("");
  console.log("Caveats:");
  console.log("  • Synthetic latency distributions; not measured production traces.");
  console.log("  • Assumes an even bell-curve arrival profile; real surges may be spikier.");
  console.log("  • Pool size of 20 is the hard ceiling — concurrent service capacity is");
  console.log(`    20 × (1000ms / signup mean ${sim.signupMeanMs}ms) = ${(20 * 1000 / sim.signupMeanMs).toFixed(0)} req/sec sustained.`);
}

main();
